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
    max_plugins: usize,
    max_settings: usize,
    max_tags: usize,
    max_name_length: usize,
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
    #[serde(default)]
    pub default: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginBundle {
    pub manifest: PluginManifest,
    pub css: String,
    pub script: Option<String>,
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
}

impl From<PluginManifest> for CommunityPlugin {
    fn from(manifest: PluginManifest) -> Self {
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

fn valid_setting_id(id: &str) -> bool {
    valid_id(id)
}

fn validate_manifest(manifest: &PluginManifest) -> Result<(), String> {
    if !valid_id(&manifest.id) {
        return Err("the plugin id must be 1–24 letters, numbers, underscores, or hyphens".into());
    }
    if manifest.name.trim().is_empty()
        || manifest.name.chars().count() > PLUGIN_RULES.max_name_length
    {
        return Err("the plugin name is empty or too long".into());
    }
    for (label, value, max) in [
        ("version", manifest.version.as_deref(), 100),
        ("author", manifest.author.as_deref(), 100),
        ("description", manifest.description.as_deref(), 500),
        ("license", manifest.license.as_deref(), 100),
    ] {
        if value.is_some_and(|value| value.chars().count() > max) {
            return Err(format!("the plugin {label} is too long"));
        }
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
    if manifest.tags.len() > PLUGIN_RULES.max_tags
        || manifest.tags.iter().any(|tag| tag.chars().count() > 32)
    {
        return Err("the plugin has too many or invalid tags".into());
    }
    if manifest.settings.len() > PLUGIN_RULES.max_settings {
        return Err("the plugin contains too many settings".into());
    }
    let mut setting_ids = HashSet::new();
    for setting in &manifest.settings {
        if !valid_setting_id(&setting.id)
            || !setting_ids.insert(&setting.id)
            || setting.label.trim().is_empty()
            || setting.label.chars().count() > 80
            || setting
                .description
                .as_ref()
                .is_some_and(|description| description.chars().count() > 200)
            || setting.setting_type != "toggle"
        {
            return Err("the plugin contains an invalid or duplicate setting".into());
        }
    }
    Ok(())
}

/// Conservatively rejects external CSS loads. Backslash escapes are disallowed
/// so a dangerous identifier cannot be hidden from this check.
fn validate_css(css: &str) -> Result<(), String> {
    if css.len() > PLUGIN_RULES.max_css_bytes {
        return Err("the plugin stylesheet is larger than the allowed size".into());
    }
    if css.contains('\\') {
        return Err("CSS escapes are not supported in plugin stylesheets".into());
    }

    let mut normalized = String::with_capacity(css.len());
    let mut chars = css.chars().peekable();
    let mut quote = None;
    while let Some(character) = chars.next() {
        if let Some(delimiter) = quote {
            if character == delimiter {
                quote = None;
            }
            normalized.push(' ');
            continue;
        }
        if character == '"' || character == '\'' {
            quote = Some(character);
            continue;
        }
        if character == '/' && chars.peek() == Some(&'*') {
            chars.next();
            let mut closed = false;
            while let Some(comment_char) = chars.next() {
                if comment_char == '*' && chars.peek() == Some(&'/') {
                    chars.next();
                    closed = true;
                    break;
                }
            }
            if !closed {
                return Err("the plugin stylesheet has an unfinished comment".into());
            }
            normalized.push(' ');
            continue;
        }
        normalized.push(character.to_ascii_lowercase());
    }
    if quote.is_some() {
        return Err("the plugin stylesheet has an unfinished string".into());
    }

    let bytes = normalized.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'@' {
            let start = index + 1;
            let mut end = start;
            while end < bytes.len() && (bytes[end].is_ascii_alphanumeric() || bytes[end] == b'-') {
                end += 1;
            }
            if &bytes[start..end] == b"import" {
                return Err("plugin stylesheets cannot use @import".into());
            }
            index = end.max(index + 1);
            continue;
        }
        if bytes[index].is_ascii_alphabetic() || bytes[index] == b'-' || bytes[index] == b'_' {
            let start = index;
            index += 1;
            while index < bytes.len()
                && (bytes[index].is_ascii_alphanumeric()
                    || bytes[index] == b'-'
                    || bytes[index] == b'_')
            {
                index += 1;
            }
            let ident = &bytes[start..index];
            if ident == b"url"
                || ident == b"expression"
                || ident == b"behavior"
                || ident == b"image-set"
                || ident == b"-webkit-image-set"
            {
                let mut next = index;
                while next < bytes.len() && bytes[next].is_ascii_whitespace() {
                    next += 1;
                }
                if ident != b"behavior" || bytes.get(next) == Some(&b':') {
                    return Err(
                        "plugin stylesheets cannot import or load external resources".into(),
                    );
                }
            }
            continue;
        }
        index += 1;
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
    })
}

async fn fetch_asset(path: &str, max_bytes: usize) -> Result<Vec<u8>, String> {
    let url = format!("{COMMUNITY_PLUGINS_BASE}/{path}");
    let response = http::client()
        .get(&url)
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|error| format!("could not download the community plugin: {error}"))?
        .error_for_status()
        .map_err(|error| format!("could not download the community plugin: {error}"))?;
    if response
        .content_length()
        .is_some_and(|length| length > max_bytes as u64)
    {
        return Err("a community plugin file is larger than the allowed size".into());
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("could not read the community plugin: {error}"))?;
    if bytes.len() > max_bytes {
        return Err("a community plugin file is larger than the allowed size".into());
    }
    Ok(bytes.to_vec())
}

async fn community_catalog() -> Result<PluginCatalog, String> {
    let bytes = fetch_asset("index.json", PLUGIN_RULES.max_catalog_bytes).await?;
    let catalog: PluginCatalog = serde_json::from_slice(&bytes)
        .map_err(|error| format!("the community plugin catalog is invalid: {error}"))?;
    if catalog.api > PLUGIN_RULES.plugin_api {
        return Err("the community plugin catalog needs a newer version of Yapmod".into());
    }
    if catalog.plugins.len() > PLUGIN_RULES.max_plugins {
        return Err("the community plugin catalog contains too many entries".into());
    }
    let mut ids = HashSet::new();
    for plugin in &catalog.plugins {
        if !valid_id(&plugin.manifest.id) || !ids.insert(&plugin.manifest.id) {
            return Err("the community plugin catalog contains an invalid or duplicate id".into());
        }
    }
    Ok(catalog)
}

async fn fetch_community_manifest(id: &str) -> Result<PluginManifest, String> {
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
    Ok(manifest)
}

fn install_bundle(
    target: &Path,
    manifest_bytes: &[u8],
    css: &[u8],
    script: Option<&[u8]>,
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
        read_bundle(target)
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(target);
    }
    result
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
        result.push(entry.manifest.into());
    }
    result.sort_by(|left: &CommunityPlugin, right| {
        left.name.to_lowercase().cmp(&right.name.to_lowercase())
    });
    Ok(result)
}

#[tauri::command]
pub async fn preview_community_plugin(id: String) -> Result<PluginManifest, String> {
    fetch_community_manifest(&id).await
}

#[tauri::command]
pub async fn install_community_plugin(
    app: AppHandle,
    id: String,
    expected_manifest: PluginManifest,
) -> Result<PluginBundle, String> {
    let manifest = fetch_community_manifest(&id).await?;
    if manifest != expected_manifest {
        return Err("the community plugin changed after you reviewed its import warning".into());
    }
    let manifest_bytes = fetch_asset(
        &format!("plugins/{id}/{MANIFEST_FILE}"),
        PLUGIN_RULES.max_manifest_bytes,
    )
    .await?;
    let package_manifest: PluginManifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|error| format!("the community plugin manifest is invalid: {error}"))?;
    if package_manifest != manifest {
        return Err("the community plugin changed while it was being downloaded".into());
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
    use super::{PluginManifest, PluginSetting, valid_id, validate_css, validate_manifest};

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
                default: false,
            }],
            stylesheet: "plugin.css".into(),
            script: None,
        }
    }

    #[test]
    fn accepts_boring_plugin_ids() {
        assert!(valid_id("focus-mode_1"));
        assert!(!valid_id("../outside"));
        assert!(!valid_id(".hidden"));
        assert!(!valid_id("plugin.with.dots"));
    }

    #[test]
    fn accepts_a_valid_manifest() {
        assert!(validate_manifest(&manifest()).is_ok());
    }

    #[test]
    fn rejects_external_css_and_code_like_constructs() {
        for css in [
            "@import url(https://example.test/a.css);",
            ".x { background: url(https://example.test/a.png); }",
            "@/**/import url(https://example.test/a.css);",
            ".x { color: e\\78pression(alert(1)); }",
        ] {
            assert!(validate_css(css).is_err(), "accepted {css}");
        }
    }

    #[test]
    fn allows_plain_styling_rules() {
        assert!(validate_css(".message { color: #fff; margin: 4px; }").is_ok());
        assert!(
            validate_css(".motion { scroll-behavior: auto; content: \"@import url\"; }").is_ok()
        );
    }
}
