use std::collections::HashMap;

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;
use tokio_tungstenite::tungstenite::Message;
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export, export_to = "types.ts")]
pub enum YaplayConnectionState {
    Disconnected,
    Connecting,
    Connected,
    Error,
}

type YaplaySink = futures_util::stream::SplitSink<
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
    Message,
>;

struct YaplayConnection {
    state: YaplayConnectionState,
    task: Option<tokio::task::JoinHandle<()>>,
    sender: Option<Mutex<YaplaySink>>,
}

pub struct YaplayState {
    connections: Mutex<HashMap<String, YaplayConnection>>,
    /// Whether plugins have requested notification forwarding.
    share_notifications: Mutex<HashMap<String, bool>>,
}

impl YaplayState {
    pub fn new() -> Self {
        Self {
            connections: Mutex::new(HashMap::new()),
            share_notifications: Mutex::new(HashMap::new()),
        }
    }
}

const ALLOWED_PLUGIN_ID: &str = "yaplay-bridge";

const STATE_EVENT: &str = "yapmod:yaplay-state";

fn check_plugin_id(plugin_id: &str) -> Result<(), String> {
    if plugin_id != ALLOWED_PLUGIN_ID {
        return Err(format!(
            "plugin {plugin_id:?} is not allowed to use Yaplay WebSocket commands"
        ));
    }
    Ok(())
}

fn emit_state(app: &AppHandle, plugin_id: &str, state: YaplayConnectionState) {
    let Some(window) = app.get_webview_window(crate::window::MAIN_WINDOW) else {
        return;
    };

    let detail = serde_json::json!({
        "pluginId": plugin_id,
        "state": state
    });
    let detail_str = detail.to_string();

    let script = format!(
        "window.dispatchEvent(new CustomEvent('{STATE_EVENT}', {{ detail: {detail_str} }}))"
    );
    let _ = window.eval(&script);
}

#[tauri::command]
pub async fn yaplay_connect(
    app: AppHandle,
    state: tauri::State<'_, YaplayState>,
    plugin_id: String,
    port: u16,
) -> Result<YaplayConnectionState, String> {
    check_plugin_id(&plugin_id)?;

    let connections = state.connections.lock().await;

    if let Some(conn) = connections.get(&plugin_id)
        && conn.state == YaplayConnectionState::Connected
    {
        return Err("already connected".to_string());
    }

    drop(connections);

    emit_state(&app, &plugin_id, YaplayConnectionState::Connecting);

    let url = format!("ws://127.0.0.1:{port}/");
    let (ws_stream, _) = match tokio_tungstenite::connect_async(&url).await {
        Ok(stream) => stream,
        Err(e) => {
            emit_state(&app, &plugin_id, YaplayConnectionState::Error);
            return Err(format!("connection failed: {e}"));
        }
    };

    let (write, read) = ws_stream.split();

    let app_clone = app.clone();
    let plugin_id_clone = plugin_id.clone();
    let task = tokio::spawn(async move {
        futures_util::pin_mut!(read);
        while read.next().await.is_some() {
        }
        emit_state(
            &app_clone,
            &plugin_id_clone,
            YaplayConnectionState::Disconnected,
        );
    });

    let conn = YaplayConnection {
        state: YaplayConnectionState::Connected,
        task: Some(task),
        sender: Some(Mutex::new(write)),
    };
    state
        .connections
        .lock()
        .await
        .insert(plugin_id.clone(), conn);

    emit_state(&app, &plugin_id, YaplayConnectionState::Connected);

    Ok(YaplayConnectionState::Connected)
}

#[tauri::command]
pub async fn yaplay_send(
    state: tauri::State<'_, YaplayState>,
    plugin_id: String,
    message: String,
) -> Result<(), String> {
    check_plugin_id(&plugin_id)?;

    let connections = state.connections.lock().await;
    let Some(conn) = connections.get(&plugin_id) else {
        return Err("not connected".to_string());
    };

    let Some(sender) = &conn.sender else {
        return Err("sender not available".to_string());
    };

    let msg = Message::Text(message.into());
    let mut write = sender.lock().await;
    write
        .send(msg)
        .await
        .map_err(|e| format!("send failed: {e}"))
}

#[tauri::command]
pub async fn yaplay_disconnect(
    app: AppHandle,
    state: tauri::State<'_, YaplayState>,
    plugin_id: String,
) -> Result<(), String> {
    check_plugin_id(&plugin_id)?;

    let mut connections = state.connections.lock().await;
    if let Some(conn) = connections.get_mut(&plugin_id) {
        if let Some(task) = conn.task.take() {
            task.abort();
        }
        conn.sender.take();
        conn.state = YaplayConnectionState::Disconnected;
    }
    connections.remove(&plugin_id);

    emit_state(&app, &plugin_id, YaplayConnectionState::Disconnected);

    Ok(())
}

#[tauri::command]
pub async fn yaplay_state(
    state: tauri::State<'_, YaplayState>,
    plugin_id: String,
) -> Result<YaplayConnectionState, String> {
    check_plugin_id(&plugin_id)?;

    let connections = state.connections.lock().await;
    let state = connections
        .get(&plugin_id)
        .map(|conn| conn.state)
        .unwrap_or(YaplayConnectionState::Disconnected);

    Ok(state)
}

#[tauri::command]
pub async fn yaplay_set_share_notifications(
    state: tauri::State<'_, YaplayState>,
    plugin_id: String,
    share: bool,
) -> Result<(), String> {
    check_plugin_id(&plugin_id)?;
    let mut flags = state.share_notifications.lock().await;
    if share {
        flags.insert(plugin_id, true);
    } else {
        flags.remove(&plugin_id);
    }
    Ok(())
}

pub async fn should_share_notifications(state: &tauri::State<'_, YaplayState>) -> bool {
    let flags = state.share_notifications.lock().await;
    flags.values().any(|v| *v)
}

pub async fn is_connected(state: &tauri::State<'_, YaplayState>) -> bool {
    let connections = state.connections.lock().await;
    connections
        .values()
        .any(|conn| conn.state == YaplayConnectionState::Connected)
}

pub async fn send_to_all(state: &tauri::State<'_, YaplayState>, message: String) {
    let connections = state.connections.lock().await;
    for conn in connections.values() {
        if conn.state != YaplayConnectionState::Connected {
            continue;
        }
        if let Some(sender) = &conn.sender {
            let msg = Message::Text(message.clone().into());
            let mut write = sender.lock().await;
            let _ = write.send(msg).await;
        }
    }
}
