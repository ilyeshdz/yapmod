use tauri::{AppHandle, Manager};
use tauri_plugin_notification::{ActionPerformed, NotificationExt};

/// The key the tag of a notification is stored under.
///
/// The tag tells us which message a notification belongs to, so the click on
/// it can be handed back to the page.
const TAG_KEY: &str = "yapmod";

/// The event the page listens to for a notification the user clicked.
const CLICK_EVENT: &str = "yapmod:notification-click";

/// Shows a notification in the notification center of the system.
///
/// The page hands over the title, the body and the tag of the message the
/// notification is about.
#[tauri::command]
pub fn notify(
    app: AppHandle,
    title: String,
    body: Option<String>,
    tag: Option<String>,
    silent: Option<bool>,
) -> Result<(), String> {
    if title.len() > 256
        || body.as_ref().is_some_and(|body| body.len() > 4096)
        || tag.as_ref().is_some_and(|tag| tag.len() > 256)
    {
        return Err("notification content exceeds the permitted size".to_string());
    }

    let mut builder = app.notification().builder().title(title);

    if let Some(body) = body {
        builder = builder.body(body);
    }

    if silent.unwrap_or(false) {
        builder = builder.silent();
    }

    if let Some(tag) = tag {
        builder = builder.extra(TAG_KEY, tag);
    }

    builder.show().map_err(|error| error.to_string())
}

/// Asks the system for the permission to show notifications.
///
/// Desktop systems do not ask for it up front, so this only reports what
/// the system knows.
#[tauri::command]
pub fn request_notification_permission(app: AppHandle) -> Result<String, String> {
    let state = app
        .notification()
        .request_permission()
        .map_err(|error| error.to_string())?;

    Ok(state.to_string())
}

/// Watches for the notifications the user clicks.
pub fn listen(app: &AppHandle) -> Result<(), String> {
    let handle = app.clone();

    app.notification()
        .on_action(move |action| {
            on_action(&handle, action);
        })
        .map_err(|error| error.to_string())
}

/// Brings the app back when the user clicks a notification.
///
/// The page gets the tag of the notification, so it can open the message the
/// notification was about.
fn on_action(app: &AppHandle, action: &ActionPerformed) {
    if action.action_id() != "tap" {
        return;
    }

    let Some(window) = app.get_webview_window(crate::window::MAIN_WINDOW) else {
        return;
    };

    crate::window::show_main(app);

    let Some(tag) = action
        .notification()
        .and_then(|notification| notification.extra().get(TAG_KEY))
        .and_then(|value| value.as_str())
    else {
        return;
    };

    let detail = serde_json::to_string(tag).unwrap_or_else(|_| "null".to_owned());

    let script =
        format!("window.dispatchEvent(new CustomEvent('{CLICK_EVENT}', {{ detail: {detail} }}))");

    let _ = window.eval(&script);
}
