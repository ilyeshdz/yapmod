use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::{LazyLock, Mutex},
    time::Duration,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::http;

const MANIFEST_FILE: &str = "manifest.json";
const CSS_FILE: &str = "plugin.css";
const SCRIPT_FILE: &str = "plugin.js";
/// Marker written only for packages installed from the verified community
/// catalog. It is deliberately not part of the published package, so a plugin
/// cannot mark itself as verified.
const VERIFIED_FILE: &str = ".yapmod-verified";
const COMMUNITY_PLUGINS_BASE: &str = if cfg!(debug_assertions) {
    "http://127.0.0.1:4321/yapmod/community-plugins"
} else {
    "https://ilyeshdz.github.io/yapmod/community-plugins"
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginRules {
    plugin_api: u32,
    max_catalog_bytes: usize,
    max_manifest_bytes: usize,
    max_css_bytes: usize,
    max_script_bytes: usize,
}

static PLUGIN_RULES: LazyLock<PluginRules> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../community-plugins/rules.json"))
        .expect("community plugin rules must be valid JSON")
});

/// A plugin package manifest. Version 1 supports CSS, settings toggles, and
/// an optional trusted page-realm script.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub license: Option<String>,
    pub api: u32,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub settings: Vec<PluginSetting>,
    #[serde(default = "default_stylesheet")]
    pub stylesheet: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub script: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginSetting {
    pub id: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(rename = "type")]
    pub setting_type: String,
    #[serde(default = "default_setting_value")]
    pub default: serde_json::Value,
    /// File-type filter for `file` settings, e.g. `"image/*"`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub accept: Option<String>,
}

fn default_setting_value() -> serde_json::Value {
    serde_json::Value::Bool(false)
}

const VALID_SETTING_TYPES: &[&str] = &["toggle", "text", "file", "color"];

fn valid_setting_type(setting_type: &str) -> bool {
    VALID_SETTING_TYPES.contains(&setting_type)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginBundle {
    pub manifest: PluginManifest,
    pub css: String,
    pub script: Option<String>,
    /// True when the package was installed from a verified catalog entry.
    pub verified: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommunityPlugin {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub license: Option<String>,
    pub api: u32,
    pub tags: Vec<String>,
    pub settings: Vec<PluginSetting>,
    pub stylesheet: String,
    pub script: Option<String>,
    /// Marked by the catalog owners after review, never by the plugin itself.
    pub verified: bool,
}

impl CommunityPlugin {
    fn new(manifest: PluginManifest, verified: bool) -> Self {
        Self {
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            author: manifest.author,
            description: manifest.description,
            license: manifest.license,
            api: manifest.api,
            tags: manifest.tags,
            settings: manifest.settings,
            stylesheet: manifest.stylesheet,
            script: manifest.script,
            verified,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginCatalog {
    api: u32,
    plugins: Vec<PluginCatalogEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginCatalogEntry {
    #[serde(flatten)]
    manifest: PluginManifest,
    /// Set by the catalog build from `community-plugins/verified.json`.
    /// Manifests cannot contain this field, so authors cannot self-declare.
    #[serde(default)]
    verified: bool,
}

static PICKED_PLUGIN_FOLDER: Mutex<Option<PathBuf>> = Mutex::new(None);

fn default_stylesheet() -> String {
    CSS_FILE.to_string()
}

fn plugins_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join("plugins"))
        .map_err(|error| error.to_string())
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 24
        && id
            .chars()
            .next()
            .is_some_and(|character| character.is_ascii_alphanumeric())
        && id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "-_".contains(character))
}

fn validate_manifest(manifest: &PluginManifest) -> Result<(), String> {
    if !valid_id(&manifest.id) {
        return Err("the plugin id must be 1–24 letters, numbers, underscores, or hyphens".into());
    }
    if manifest.name.trim().is_empty() {
        return Err("the plugin name is empty".into());
    }
    if manifest.api != PLUGIN_RULES.plugin_api {
        return Err(format!(
            "the plugin requires API {}, this version supports API {}",
            manifest.api, PLUGIN_RULES.plugin_api
        ));
    }
    if manifest.stylesheet != CSS_FILE {
        return Err(format!("the plugin stylesheet must be named {CSS_FILE}"));
    }
    if manifest
        .script
        .as_deref()
        .is_some_and(|script| script != SCRIPT_FILE)
    {
        return Err(format!("the plugin script must be named {SCRIPT_FILE}"));
    }
    let mut setting_ids = HashSet::new();
    for setting in &manifest.settings {
        if !valid_id(&setting.id)
            || !setting_ids.insert(&setting.id)
            || setting.label.trim().is_empty()
            || !valid_setting_type(&setting.setting_type)
        {
            return Err("the plugin contains an invalid or duplicate setting".into());
        }
        // Validate default value matches the setting type
        match setting.setting_type.as_str() {
            "toggle" => {
                if !setting.default.is_boolean() {
                    return Err("toggle settings must have a boolean default".into());
                }
            }
            "text" | "file" | "color" => {
                if !setting.default.is_string() && !setting.default.is_null() {
                    return Err(format!(
                        "{} settings must have a string or null default",
                        setting.setting_type
                    ));
                }
            }
            _ => {
                return Err("the plugin contains an invalid or duplicate setting".into());
            }
        }
    }
    Ok(())
}

/// Rejects stylesheets that exceed the configured size limit.
fn validate_css(css: &str) -> Result<(), String> {
    if css.len() > PLUGIN_RULES.max_css_bytes {
        return Err("the plugin stylesheet is larger than the allowed size".into());
    }
    Ok(())
}

fn read_regular_file(path: &Path, limit: usize, label: &str) -> Result<Vec<u8>, String> {
    let metadata = fs::symlink_metadata(path).map_err(|_| format!("the plugin has no {label}"))?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(format!("the plugin {label} is not a regular file"));
    }
    if metadata.len() > limit as u64 {
        return Err(format!(
            "the plugin {label} is larger than the allowed size"
        ));
    }
    fs::read(path).map_err(|error| format!("could not read the plugin {label}: {error}"))
}

fn read_manifest(folder: &Path) -> Result<(PluginManifest, Vec<u8>), String> {
    let bytes = read_regular_file(
        &folder.join(MANIFEST_FILE),
        PLUGIN_RULES.max_manifest_bytes,
        MANIFEST_FILE,
    )?;
    let manifest: PluginManifest = serde_json::from_slice(&bytes)
        .map_err(|error| format!("the plugin manifest is invalid: {error}"))?;
    validate_manifest(&manifest)?;
    Ok((manifest, bytes))
}

fn read_bundle(folder: &Path) -> Result<PluginBundle, String> {
    let (manifest, _) = read_manifest(folder)?;
    let css_bytes = read_regular_file(
        &folder.join(&manifest.stylesheet),
        PLUGIN_RULES.max_css_bytes,
        &manifest.stylesheet,
    )?;
    let css = String::from_utf8(css_bytes)
        .map_err(|_| "the plugin stylesheet is not valid UTF-8".to_string())?;
    validate_css(&css)?;
    let script = match manifest.script.as_deref() {
        Some(script_file) => Some(
            String::from_utf8(read_regular_file(
                &folder.join(script_file),
                PLUGIN_RULES.max_script_bytes,
                script_file,
            )?)
            .map_err(|_| "the plugin script is not valid UTF-8".to_string())?,
        ),
        None => None,
    };
    Ok(PluginBundle {
        manifest,
        css,
        script,
        verified: folder.join(VERIFIED_FILE).is_file(),
    })
}

async fn fetch_asset(path: &str, max_bytes: usize) -> Result<Vec<u8>, String> {
    let url = format!("{COMMUNITY_PLUGINS_BASE}/{path}");
    http::fetch(&url, max_bytes, Duration::from_secs(20))
        .await
        .map_err(|error| format!("could not download the community plugin: {error}"))?
        .ok_or_else(|| "the community plugin file was not found".to_string())
}

async fn community_catalog() -> Result<PluginCatalog, String> {
    let bytes = fetch_asset("index.json", PLUGIN_RULES.max_catalog_bytes).await?;
    let catalog: PluginCatalog = serde_json::from_slice(&bytes)
        .map_err(|error| format!("the community plugin catalog is invalid: {error}"))?;
    if catalog.api > PLUGIN_RULES.plugin_api {
        return Err("the community plugin catalog needs a newer version of Yapmod".into());
    }
    let mut ids = HashSet::new();
    for plugin in &catalog.plugins {
        if !valid_id(&plugin.manifest.id) || !ids.insert(&plugin.manifest.id) {
            return Err("the community plugin catalog contains an invalid or duplicate id".into());
        }
    }
    Ok(catalog)
}

async fn fetch_community_manifest(id: &str) -> Result<(PluginManifest, Vec<u8>, bool), String> {
    if !valid_id(id) {
        return Err("that is not a valid plugin id".into());
    }
    let catalog = community_catalog().await?;
    let entry = catalog
        .plugins
        .iter()
        .find(|entry| entry.manifest.id == id)
        .ok_or_else(|| "that plugin is not in the community catalog".to_string())?;
    if entry.manifest.api != PLUGIN_RULES.plugin_api {
        return Err("that plugin requires a newer version of Yapmod".into());
    }
    let bytes = fetch_asset(
        &format!("plugins/{id}/{MANIFEST_FILE}"),
        PLUGIN_RULES.max_manifest_bytes,
    )
    .await?;
    let manifest: PluginManifest = serde_json::from_slice(&bytes)
        .map_err(|error| format!("the community plugin manifest is invalid: {error}"))?;
    if manifest.id != id || manifest != entry.manifest {
        return Err("the community plugin id does not match the catalog".into());
    }
    validate_manifest(&manifest)?;
    Ok((manifest, bytes, entry.verified))
}

fn install_bundle(
    target: &Path,
    manifest_bytes: &[u8],
    css: &[u8],
    script: Option<&[u8]>,
    verified: bool,
) -> Result<PluginBundle, String> {
    let parent = target
        .parent()
        .ok_or_else(|| "the plugin folder has no parent".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    fs::create_dir(target).map_err(|error| {
        if error.kind() == std::io::ErrorKind::AlreadyExists {
            "a plugin with this id is already installed; remove it first".to_string()
        } else {
            error.to_string()
        }
    })?;
    let result = (|| {
        fs::write(target.join(MANIFEST_FILE), manifest_bytes).map_err(|error| error.to_string())?;
        fs::write(target.join(CSS_FILE), css).map_err(|error| error.to_string())?;
        if let Some(script) = script {
            fs::write(target.join(SCRIPT_FILE), script).map_err(|error| error.to_string())?;
        }
        if verified {
            fs::write(target.join(VERIFIED_FILE), b"1").map_err(|error| error.to_string())?;
        }
        read_bundle(target)
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(target);
    }
    result
}

/// Maps a manifest `accept` hint to file-dialog extensions. Hints are
/// MIME-style (`image/*`, `image/png`) while the dialog filter takes bare
/// extensions; unknown hints leave the picker unfiltered rather than
/// blocking every file.
fn extensions_for_accept(accept: Option<&str>) -> Option<Vec<&'static str>> {
    const IMAGE_EXTENSIONS: [&str; 9] = [
        "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif",
    ];
    let accept = accept?.trim().to_ascii_lowercase();
    if accept.is_empty() || accept == "*/*" {
        return None;
    }
    if let Some(subtype) = accept.strip_prefix("image/") {
        return match subtype {
            "*" => Some(IMAGE_EXTENSIONS.to_vec()),
            "jpeg" => Some(vec!["jpg", "jpeg"]),
            "svg+xml" => Some(vec!["svg"]),
            _ => IMAGE_EXTENSIONS
                .iter()
                .find(|extension| **extension == subtype)
                .map(|extension| vec![*extension]),
        };
    }
    // Other MIME families (audio/, video/, …) have no mapping here, so the
    // picker stays unfiltered.
    None
}

/// Opens a native file picker, reads the selected file immediately, and returns
/// a base64 data URI. The plugin receives the file content directly in its settings
/// value, so no runtime file-reading command is needed.
#[tauri::command]
pub async fn pick_plugin_file(
    app: AppHandle,
    accept: Option<String>,
) -> Result<Option<String>, String> {
    let extensions = extensions_for_accept(accept.as_deref());
    let selected = tauri::async_runtime::spawn_blocking(move || {
        let dialog = app.dialog().file().set_title("Select a file");
        match extensions {
            Some(extensions) => dialog
                .add_filter("Images", &extensions)
                .blocking_pick_file(),
            None => dialog.blocking_pick_file(),
        }
    })
    .await
    .map_err(|error| error.to_string())?;
    let Some(path) = selected else {
        return Ok(None);
    };
    let path = PathBuf::from(path.to_string());
    if path.is_symlink() {
        return Err(format!(
            "Symbolic links are not allowed: {}",
            path.display()
        ));
    }
    if !path.is_file() {
        return Err(format!("Not a file: {}", path.display()));
    }
    let bytes = fs::read(&path).map_err(|error| format!("Failed to read file: {}", error))?;

    // Detect MIME type from extension
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default();
    let mime_type = crate::mime::image_mime(ext).unwrap_or("application/octet-stream");

    Ok(Some(crate::mime::data_uri(mime_type, &bytes)))
}

/// Opens a native folder picker and returns validated metadata for consent.
#[tauri::command]
pub async fn pick_plugin_folder(app: AppHandle) -> Result<Option<PluginManifest>, String> {
    *PICKED_PLUGIN_FOLDER
        .lock()
        .map_err(|_| "plugin folder selection is unavailable".to_string())? = None;
    let folder = plugins_dir(&app)?;
    fs::create_dir_all(&folder).map_err(|error| error.to_string())?;
    let selected = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Import a plugin")
            .set_directory(&folder)
            .blocking_pick_folder()
            .map(|path| PathBuf::from(path.to_string()))
    })
    .await
    .map_err(|error| error.to_string())?;
    let Some(selected) = selected else {
        *PICKED_PLUGIN_FOLDER
            .lock()
            .map_err(|_| "plugin folder selection is unavailable".to_string())? = None;
        return Ok(None);
    };
    let selected = selected
        .canonicalize()
        .map_err(|error| format!("could not open the selected plugin folder: {error}"))?;
    if !selected.is_dir() {
        return Err("the selected plugin is not a folder".into());
    }
    let (manifest, _) = read_manifest(&selected)?;
    let _ = read_bundle(&selected)?;
    *PICKED_PLUGIN_FOLDER
        .lock()
        .map_err(|_| "plugin folder selection is unavailable".to_string())? = Some(selected);
    Ok(Some(manifest))
}

/// Installs the exact folder selected by the native picker. Only the manifest
/// stylesheet, and optional script are copied; extra files and symlinks are ignored.
#[tauri::command]
pub fn install_picked_plugin(
    app: AppHandle,
    expected_manifest: PluginManifest,
) -> Result<PluginBundle, String> {
    let selected = PICKED_PLUGIN_FOLDER
        .lock()
        .map_err(|_| "plugin folder selection is unavailable".to_string())?
        .take()
        .ok_or_else(|| "choose a plugin folder with the native picker first".to_string())?;
    let selected = selected
        .canonicalize()
        .map_err(|error| format!("the selected plugin folder is unavailable: {error}"))?;
    let (manifest, manifest_bytes) = read_manifest(&selected)?;
    if manifest != expected_manifest {
        return Err("the plugin changed after you reviewed its import warning".into());
    }
    let bundle = read_bundle(&selected)?;
    let css_bytes = bundle.css.as_bytes();
    install_bundle(
        &plugins_dir(&app)?.join(&manifest.id),
        &manifest_bytes,
        css_bytes,
        bundle.script.as_deref().map(str::as_bytes),
        false,
    )
}

#[tauri::command]
pub fn list_plugins(app: AppHandle) -> Result<Vec<PluginBundle>, String> {
    let folder = plugins_dir(&app)?;
    let entries = match fs::read_dir(&folder) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.to_string()),
    };
    let mut plugins = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        if entry
            .file_type()
            .map_err(|error| error.to_string())?
            .is_symlink()
        {
            continue;
        }
        if !entry
            .file_type()
            .map_err(|error| error.to_string())?
            .is_dir()
        {
            continue;
        }
        if let Ok(bundle) = read_bundle(&entry.path()) {
            plugins.push(bundle);
        }
    }
    plugins.sort_by(|left, right| {
        left.manifest
            .name
            .to_lowercase()
            .cmp(&right.manifest.name.to_lowercase())
    });
    Ok(plugins)
}

#[tauri::command]
pub async fn list_community_plugins() -> Result<Vec<CommunityPlugin>, String> {
    let catalog = community_catalog().await?;
    let mut result = Vec::new();
    for entry in catalog.plugins {
        if entry.manifest.api != PLUGIN_RULES.plugin_api {
            continue;
        }
        validate_manifest(&entry.manifest)?;
        result.push(CommunityPlugin::new(entry.manifest, entry.verified));
    }
    result.sort_by(|left: &CommunityPlugin, right| {
        left.name.to_lowercase().cmp(&right.name.to_lowercase())
    });
    Ok(result)
}

#[tauri::command]
pub async fn preview_community_plugin(id: String) -> Result<PluginManifest, String> {
    fetch_community_manifest(&id)
        .await
        .map(|(manifest, _, _)| manifest)
}

#[tauri::command]
pub async fn install_community_plugin(
    app: AppHandle,
    id: String,
    expected_manifest: PluginManifest,
) -> Result<PluginBundle, String> {
    let (manifest, manifest_bytes, verified) = fetch_community_manifest(&id).await?;
    if manifest != expected_manifest {
        return Err("the community plugin changed after you reviewed its import warning".into());
    }
    let css = fetch_asset(
        &format!("plugins/{id}/{}", manifest.stylesheet),
        PLUGIN_RULES.max_css_bytes,
    )
    .await?;
    let css_text = String::from_utf8(css.clone())
        .map_err(|_| "the community plugin stylesheet is not valid UTF-8".to_string())?;
    validate_css(&css_text)?;
    let script = match manifest.script.as_deref() {
        Some(script_file) => Some(
            fetch_asset(
                &format!("plugins/{id}/{script_file}"),
                PLUGIN_RULES.max_script_bytes,
            )
            .await?,
        ),
        None => None,
    };
    let installed = install_bundle(
        &plugins_dir(&app)?.join(id),
        &manifest_bytes,
        &css,
        script.as_deref(),
        verified,
    )?;
    if installed.manifest != expected_manifest {
        return Err("the installed plugin differs from the reviewed manifest".into());
    }
    Ok(installed)
}

#[tauri::command]
pub fn open_plugins_folder(app: AppHandle) -> Result<(), String> {
    let folder = plugins_dir(&app)?;
    fs::create_dir_all(&folder).map_err(|error| error.to_string())?;
    app.opener()
        .open_path(folder.to_string_lossy().to_string(), None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn remove_plugin(app: AppHandle, id: String) -> Result<(), String> {
    if !valid_id(&id) {
        return Err("that is not a valid plugin id".into());
    }
    let folder = plugins_dir(&app)?.join(&id);
    if let Ok(metadata) = fs::symlink_metadata(&folder) {
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err("the plugin install path is not a regular folder".into());
        }
        fs::remove_dir_all(&folder).map_err(|error| error.to_string())?;
    }
    crate::config::remove_plugin_data(&app, &id).map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        PluginCatalogEntry, PluginManifest, PluginSetting, extensions_for_accept, valid_id,
        validate_css, validate_manifest,
    };

    fn manifest() -> PluginManifest {
        PluginManifest {
            id: "sample-plugin".into(),
            name: "Sample plugin".into(),
            version: Some("1.0.0".into()),
            author: None,
            description: None,
            license: None,
            api: 1,
            tags: vec![],
            settings: vec![PluginSetting {
                id: "compact-mode".into(),
                label: "Compact mode".into(),
                description: None,
                setting_type: "toggle".into(),
                default: serde_json::json!(false),
                accept: None,
            }],
            stylesheet: "plugin.css".into(),
            script: None,
        }
    }

    #[test]
    fn accepts_all_setting_types() {
        let manifest_with_text = PluginManifest {
            settings: vec![PluginSetting {
                id: "custom-text".into(),
                label: "Custom text".into(),
                description: None,
                setting_type: "text".into(),
                default: serde_json::json!("hello"),
                accept: None,
            }],
            ..manifest()
        };
        assert!(validate_manifest(&manifest_with_text).is_ok());

        let manifest_with_file = PluginManifest {
            settings: vec![PluginSetting {
                id: "bg-image".into(),
                label: "Background image".into(),
                description: None,
                setting_type: "file".into(),
                default: serde_json::json!(null),
                accept: Some("image/*".into()),
            }],
            ..manifest()
        };
        assert!(validate_manifest(&manifest_with_file).is_ok());

        let manifest_with_color = PluginManifest {
            settings: vec![PluginSetting {
                id: "accent-color".into(),
                label: "Accent color".into(),
                description: None,
                setting_type: "color".into(),
                default: serde_json::json!("#ff0000"),
                accept: None,
            }],
            ..manifest()
        };
        assert!(validate_manifest(&manifest_with_color).is_ok());
    }

    #[test]
    fn rejects_mismatched_default_types() {
        let manifest_toggle_with_string = PluginManifest {
            settings: vec![PluginSetting {
                id: "bad-toggle".into(),
                label: "Bad toggle".into(),
                description: None,
                setting_type: "toggle".into(),
                default: serde_json::json!("yes"),
                accept: None,
            }],
            ..manifest()
        };
        assert!(validate_manifest(&manifest_toggle_with_string).is_err());

        let manifest_text_with_bool = PluginManifest {
            settings: vec![PluginSetting {
                id: "bad-text".into(),
                label: "Bad text".into(),
                description: None,
                setting_type: "text".into(),
                default: serde_json::json!(true),
                accept: None,
            }],
            ..manifest()
        };
        assert!(validate_manifest(&manifest_text_with_bool).is_err());
    }

    #[test]
    fn accepts_boring_plugin_ids() {
        assert!(valid_id("focus-mode_1"));
        assert!(!valid_id("../outside"));
        assert!(!valid_id(".hidden"));
        assert!(!valid_id("plugin.with.dots"));
    }

    #[test]
    fn accept_hints_map_to_dialog_extensions() {
        assert_eq!(
            extensions_for_accept(Some("image/*")),
            Some(vec![
                "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"
            ])
        );
        assert_eq!(extensions_for_accept(Some("image/png")), Some(vec!["png"]));
        assert_eq!(
            extensions_for_accept(Some("image/jpeg")),
            Some(vec!["jpg", "jpeg"])
        );
        assert_eq!(
            extensions_for_accept(Some("image/svg+xml")),
            Some(vec!["svg"])
        );
        assert_eq!(
            extensions_for_accept(Some(" image/* ")),
            extensions_for_accept(Some("image/*"))
        );

        // Unknown or absent hints leave the picker unfiltered instead of
        // blocking files the plugin can still read.
        assert_eq!(extensions_for_accept(None), None);
        assert_eq!(extensions_for_accept(Some("")), None);
        assert_eq!(extensions_for_accept(Some("*/*")), None);
        assert_eq!(extensions_for_accept(Some("application/pdf")), None);
        assert_eq!(extensions_for_accept(Some("image/tiff")), None);
    }

    #[test]
    fn accepts_a_valid_manifest() {
        assert!(validate_manifest(&manifest()).is_ok());
    }

    #[test]
    fn allows_external_css_constructs() {
        for css in [
            "@import url(https://example.test/a.css);",
            ".x { background: url(https://example.test/a.png); }",
            "@/**/import url(https://example.test/a.css);",
            ".x { color: e\\78pression(alert(1)); }",
            ".x { background: image-set(\"a.png\" 1x); }",
            ".x { behavior: url(#default#time2); }",
        ] {
            assert!(validate_css(css).is_ok(), "rejected {css}");
        }
    }

    #[test]
    fn catalog_verification_is_opt_in() {
        let base = serde_json::json!({
            "id": "sample-plugin",
            "name": "Sample plugin",
            "api": 1,
            "stylesheet": "plugin.css",
        });

        let unverified: PluginCatalogEntry =
            serde_json::from_value(base.clone()).expect("catalog entry should parse");
        assert!(!unverified.verified);

        let mut verified = base;
        verified["verified"] = serde_json::json!(true);
        let verified: PluginCatalogEntry =
            serde_json::from_value(verified).expect("verified catalog entry should parse");
        assert!(verified.verified);
    }

    #[test]
    fn manifests_cannot_self_declare_verification() {
        let manifest = serde_json::json!({
            "id": "sample-plugin",
            "name": "Sample plugin",
            "api": 1,
            "stylesheet": "plugin.css",
            "verified": true,
        });
        assert!(serde_json::from_value::<PluginManifest>(manifest).is_err());
    }

    #[test]
    fn allows_plain_styling_rules() {
        assert!(validate_css(".message { color: #fff; margin: 4px; }").is_ok());
        assert!(
            validate_css(".motion { scroll-behavior: auto; content: \"@import url\"; }").is_ok()
        );
    }
}
