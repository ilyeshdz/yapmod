use std::{collections::BTreeMap, fs, path::PathBuf, sync::RwLock};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};
use ts_rs::TS;

static CONFIG_CACHE: RwLock<Option<Config>> = RwLock::new(None);

pub type ConfigResult<T> = Result<T, Box<dyn std::error::Error>>;

/// The settings of the desktop client.
///
/// Every option the user can change lives in `settings`, keyed by name.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "types.ts")]
pub struct Config {
    #[serde(default)]
    pub last_seen_version: Option<String>,
    #[serde(default)]
    pub settings: BTreeMap<String, Value>,
}

/// The settings that are always present.
const DEFAULT_SETTINGS: [(&str, bool); 3] = [
    ("use_native_titlebar", false),
    ("start_maximized", false),
    ("keep_in_tray", true),
];

/// The settings that used to live at the top level of the config file.
const LEGACY_SETTINGS: [&str; 2] = ["use_native_titlebar", "start_maximized"];

/// Moves the legacy top-level settings into the settings map, so every
/// value the user can change lives in exactly one place.
fn migrate(mut raw: Value) -> Value {
    let Some(object) = raw.as_object_mut() else {
        return raw;
    };

    for key in LEGACY_SETTINGS {
        let Some(value) = object.remove(key) else {
            continue;
        };

        let settings = object
            .entry("settings")
            .or_insert_with(|| Value::Object(Default::default()));

        if let Some(settings) = settings.as_object_mut() {
            settings.entry(key.to_string()).or_insert(value);
        }
    }

    raw
}

impl Default for Config {
    fn default() -> Self {
        let settings = DEFAULT_SETTINGS
            .iter()
            .map(|(key, value)| ((*key).to_string(), Value::Bool(*value)))
            .collect();

        Self {
            last_seen_version: None,
            settings,
        }
    }
}

impl Config {
    /// Fills in the settings that are missing from the loaded config.
    fn merge(self, other: Self) -> Self {
        let mut settings = self.settings;
        settings.extend(other.settings);

        Self {
            last_seen_version: other.last_seen_version.or(self.last_seen_version),
            settings,
        }
    }

    pub fn setting_bool(&self, key: &str) -> Option<bool> {
        match self.settings.get(key) {
            Some(Value::Bool(value)) => Some(*value),
            _ => None,
        }
    }

    pub fn setting_str(&self, key: &str) -> Option<&str> {
        match self.settings.get(key) {
            Some(Value::String(value)) => Some(value.as_str()),
            _ => None,
        }
    }

    pub fn init(
        app: &AppHandle,
        current_version: &str,
    ) -> ConfigResult<(Self, bool, Option<String>)> {
        let path = config_path(app)?;
        let first_run = !path.exists();

        let mut config = if first_run {
            Self::default()
        } else {
            Self::from_file(path.clone())?
        };

        let previous_version = config.last_seen_version.clone();

        if previous_version.as_deref() != Some(current_version) {
            config.last_seen_version = Some(current_version.to_owned());
            config.to_file(path)?;
        }

        cache(&config);

        Ok((config, first_run, previous_version))
    }

    pub fn load(app: &AppHandle) -> ConfigResult<Self> {
        if let Some(config) = cached() {
            return Ok(config);
        }

        let config = Self::from_file(config_path(app)?)?;
        cache(&config);

        Ok(config)
    }

    pub fn save(app: &AppHandle, config: &Config) -> ConfigResult<()> {
        config.to_file(config_path(app)?)?;
        cache(config);

        Ok(())
    }

    pub fn from_file(path: PathBuf) -> ConfigResult<Self> {
        let contents = fs::read_to_string(path)?;
        Self::from_str(contents)
    }

    pub fn from_str(contents: impl AsRef<str>) -> ConfigResult<Self> {
        let raw = match serde_json::from_str::<Value>(contents.as_ref()) {
            Ok(raw) => raw,
            Err(error) => {
                eprintln!("failed to parse config, using defaults: {error}");
                return Ok(Self::default());
            }
        };

        match serde_json::from_value::<Config>(migrate(raw)) {
            Ok(config) => Ok(Self::default().merge(config)),
            Err(error) => {
                eprintln!("failed to parse config, using defaults: {error}");
                Ok(Self::default())
            }
        }
    }

    pub fn to_file(&self, path: PathBuf) -> ConfigResult<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        fs::write(path, serde_json::to_string_pretty(self)?)?;

        Ok(())
    }
}

/// The config that was loaded last.
fn cached() -> Option<Config> {
    CONFIG_CACHE
        .read()
        .expect("config cache lock poisoned")
        .clone()
}

/// Keeps the config around, so it is only read from disk once.
fn cache(config: &Config) {
    *CONFIG_CACHE.write().expect("config cache lock poisoned") = Some(config.clone());
}

fn config_path(app: &AppHandle) -> ConfigResult<PathBuf> {
    Ok(app.path().app_config_dir()?.join("config.json"))
}

fn valid_setting(key: &str, value: &Value) -> bool {
    if key.len() > 64 {
        return false;
    }

    match key {
        "use_native_titlebar"
        | "start_maximized"
        | "keep_in_tray"
        | "auto_update"
        | "notifications"
        | "unread_badge" => value.is_boolean(),
        "theme_id" => value.as_str().is_some_and(|id| {
            id.len() <= 100
                && !id.starts_with('.')
                && id
                    .chars()
                    .all(|ch| ch.is_ascii_alphanumeric() || "-_.".contains(ch))
        }),
        "theme_mode" => value
            .as_str()
            .is_some_and(|mode| matches!(mode, "system" | "dark" | "light")),
        _ => false,
    }
}

#[tauri::command]
pub fn set_settings(app: AppHandle, values: BTreeMap<String, Value>) -> Result<(), String> {
    if values.len() > 32 {
        return Err("too many settings were provided".to_string());
    }

    let mut config = Config::load(&app).map_err(|error| error.to_string())?;

    for (key, value) in values {
        if !valid_setting(&key, &value) {
            return Err(format!("unsupported or invalid setting `{key}`"));
        }

        config.settings.insert(key, value);
    }

    Config::save(&app, &config).map_err(|error| error.to_string())?;

    // The tray is part of the settings, so it is created or removed right
    // away instead of waiting for a restart.
    crate::tray::sync(&app);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{Config, valid_setting};
    use serde_json::json;

    #[test]
    fn moves_the_legacy_settings_into_the_map() {
        let config = Config::from_str(
            r#"{
                "use_native_titlebar": true,
                "start_maximized": true,
                "last_seen_version": "0.1.2"
            }"#,
        )
        .unwrap();

        assert_eq!(config.setting_bool("use_native_titlebar"), Some(true));
        assert_eq!(config.setting_bool("start_maximized"), Some(true));
        assert_eq!(config.last_seen_version.as_deref(), Some("0.1.2"));
    }

    #[test]
    fn keeps_the_settings_that_are_already_in_the_map() {
        let config = Config::from_str(
            r#"{
                "use_native_titlebar": true,
                "settings": { "use_native_titlebar": false }
            }"#,
        )
        .unwrap();

        assert_eq!(config.setting_bool("use_native_titlebar"), Some(false));
    }

    #[test]
    fn falls_back_to_the_defaults() {
        let config = Config::from_str("not json").unwrap();

        assert_eq!(config.setting_bool("use_native_titlebar"), Some(false));
        assert_eq!(config.setting_bool("start_maximized"), Some(false));
        assert_eq!(config.setting_bool("keep_in_tray"), Some(true));
    }

    #[test]
    fn setting_updates_are_allowlisted_and_type_checked() {
        assert!(valid_setting("notifications", &json!(false)));
        assert!(valid_setting("theme_id", &json!("my-theme_1")));
        assert!(!valid_setting("arbitrary", &json!(true)));
        assert!(!valid_setting("notifications", &json!("yes")));
        assert!(!valid_setting("theme_id", &json!("../config")));
    }
}
