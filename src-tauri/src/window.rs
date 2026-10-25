use tauri::{AppHandle, Manager, WebviewWindow, WindowEvent};

/// The label of the window the app lives in.
pub const MAIN_WINDOW: &str = "main";

/// Brings the main window back in front of the user.
///
/// The window is shown whether it was hidden or minimized, so the same helper
/// works for the tray icon, the notification and the dock icon.
pub fn show_main(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        return;
    };

    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

/// Minimizes the main window from its injected titlebar controls.
#[tauri::command]
pub fn minimize_main_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.minimize();
    }
}

/// Maximizes the main window, or restores it when it is already maximized.
#[tauri::command]
pub fn toggle_main_window_maximize(app: AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = if window.is_maximized().unwrap_or(false) {
            window.unmaximize()
        } else {
            window.maximize()
        };
    }
}

/// Closes the main window from its injected titlebar controls.
#[tauri::command]
pub fn close_main_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.close();
    }
}

/// Restarts the full desktop process so staged client bundles are loaded.
#[tauri::command]
pub fn restart_app(app: AppHandle) {
    std::thread::spawn(move || {
        // Let Tauri send the command response before it tears down the IPC
        // connection as part of restarting the process.
        std::thread::sleep(std::time::Duration::from_millis(150));
        app.restart();
    });
}

/// Keeps the app running in the tray when the window is closed.
///
/// Closing the window only hides it, so the page stays loaded and messages
/// keep arriving while the app sits in the tray. The window is really closed
/// when the user quits from the tray menu, or when the tray is turned off.
pub fn install_close_handler(window: &WebviewWindow) {
    let app = window.app_handle().clone();
    let target = window.clone();

    window.on_window_event(move |event| {
        let WindowEvent::CloseRequested { api, .. } = event else {
            return;
        };

        if !crate::tray::keeps_running(&app) {
            return;
        }

        api.prevent_close();
        let _ = target.hide();
    });
}
