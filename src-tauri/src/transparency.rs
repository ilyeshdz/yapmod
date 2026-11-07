use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::config::Config;
use crate::theme::{ThemeBundle, ThemeMode};
use crate::window::MAIN_WINDOW;

/// The result of applying or clearing the native window effect.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransparencyStatus {
    /// Whether this platform can apply a native window effect.
    pub supported: bool,
    /// The effect that was applied, for example `mica` or `vibrancy`.
    pub effect: Option<&'static str>,
    /// Whether an effect is currently active.
    pub applied: bool,
}

/// The system theme the native effect should follow.
///
/// A theme that only supports one mode has the last word. A theme that supports
/// both follows the `theme_mode` setting, and `None` means the operating system
/// decides.
pub fn dark_mode(config: &Config, theme: Option<&ThemeBundle>) -> Option<bool> {
    match theme.map(|theme| theme.mode) {
        Some(ThemeMode::Dark) => Some(true),
        Some(ThemeMode::Light) => Some(false),
        _ => match config.setting_str("theme_mode") {
            Some("dark") => Some(true),
            Some("light") => Some(false),
            _ => None,
        },
    }
}

/// Whether the current platform has a native window effect.
pub fn supported() -> bool {
    cfg!(any(target_os = "macos", target_os = "windows"))
}

/// Applies the platform-default transparency effect to the main window.
///
/// The call is ignored on platforms without a native effect. Errors are logged
/// because startup has no user-facing place to report them; the settings toggle
/// uses [`set_transparency`] instead, which returns the result to the client.
pub fn apply_default_effect(app: &AppHandle, dark: Option<bool>) {
    if !supported() {
        return;
    }

    if let Err(error) = set_effect(app, true, dark) {
        eprintln!("failed to apply window transparency: {error}");
    }
}

/// Applies or clears the native window effect at runtime.
///
/// Some platforms require the effect to be changed on the main thread, so the
/// work is handed to Tauri's main-thread queue and the reply is awaited.
#[tauri::command]
pub async fn set_transparency(
    app: AppHandle,
    enabled: bool,
    dark: Option<bool>,
) -> Result<TransparencyStatus, String> {
    if !supported() {
        return Err("window transparency is not supported on this platform".to_string());
    }

    let handle = app.clone();
    let (sender, receiver) = tokio::sync::oneshot::channel();

    app.run_on_main_thread(move || {
        let _ = sender.send(set_effect(&handle, enabled, dark));
    })
    .map_err(|error| error.to_string())?;

    let effect = receiver.await.map_err(|error| error.to_string())??;

    Ok(TransparencyStatus {
        supported: true,
        effect,
        applied: enabled,
    })
}

fn set_effect(
    app: &AppHandle,
    enabled: bool,
    dark: Option<bool>,
) -> Result<Option<&'static str>, String> {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        return Err("the main window is not available".to_string());
    };

    clear_effect(&window);

    if !enabled {
        return Ok(None);
    }

    apply_effect(&window, dark).map(Some)
}

#[cfg(target_os = "macos")]
fn apply_effect(
    window: &tauri::WebviewWindow,
    _dark: Option<bool>,
) -> Result<&'static str, String> {
    use window_vibrancy::{NSVisualEffectMaterial, NSVisualEffectState, apply_vibrancy};

    apply_vibrancy(
        window,
        NSVisualEffectMaterial::UnderWindowBackground,
        Some(NSVisualEffectState::FollowsWindowActiveState),
        Some(10.0),
    )
    .map_err(|error| error.to_string())?;

    Ok("vibrancy")
}

#[cfg(target_os = "windows")]
fn apply_effect(window: &tauri::WebviewWindow, dark: Option<bool>) -> Result<&'static str, String> {
    use window_vibrancy::{apply_acrylic, apply_blur, apply_mica};

    // Mica is the cheapest and most native effect, but it only exists on
    // Windows 11. Fall back to acrylic and then blur on older systems.
    if apply_mica(window, dark).is_ok() {
        return Ok("mica");
    }

    if apply_acrylic(window, None).is_ok() {
        return Ok("acrylic");
    }

    if apply_blur(window, Some((18, 18, 18, 125))).is_ok() {
        return Ok("blur");
    }

    Err("no supported window effect is available".to_string())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn apply_effect(
    _window: &tauri::WebviewWindow,
    _dark: Option<bool>,
) -> Result<&'static str, String> {
    Err("window transparency is not supported on this platform".to_string())
}

#[cfg(target_os = "macos")]
fn clear_effect(window: &tauri::WebviewWindow) {
    let _ = window_vibrancy::clear_vibrancy(window);
}

#[cfg(target_os = "windows")]
fn clear_effect(window: &tauri::WebviewWindow) {
    let _ = window_vibrancy::clear_mica(window);
    let _ = window_vibrancy::clear_acrylic(window);
    let _ = window_vibrancy::clear_blur(window);
    let _ = window_vibrancy::clear_tabbed(window);
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn clear_effect(_window: &tauri::WebviewWindow) {}

#[cfg(test)]
mod tests {
    use super::dark_mode;
    use crate::config::Config;

    #[test]
    fn follows_the_saved_theme_mode() {
        let config = Config::from_str(r#"{"settings":{"theme_mode":"light"}}"#).unwrap();
        assert_eq!(dark_mode(&config, None), Some(false));

        let config = Config::from_str(r#"{"settings":{"theme_mode":"dark"}}"#).unwrap();
        assert_eq!(dark_mode(&config, None), Some(true));

        let config = Config::from_str(r#"{"settings":{"theme_mode":"system"}}"#).unwrap();
        assert_eq!(dark_mode(&config, None), None);
    }
}
