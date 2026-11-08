use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::{LazyLock, Mutex},
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use ts_rs::TS;

use crate::error::YapmodError;
use crate::{config::Config, http};

const MANIFEST_FILE: &str = "manifest.json";
const DEFAULT_CSS_FILE: &str = "theme.css";
const COMMUNITY_THEMES_BASE: &str = if cfg!(debug_assertions) {
    "http://127.0.0.1:4321/yapmod/community-themes"
} else {
    "https://ilyeshdz.github.io/yapmod/community-themes"
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ThemeRules {
    theme_api: u32,
    max_catalog_bytes: usize,
    max_manifest_bytes: usize,
    max_css_bytes: usize,
}

static THEME_RULES: LazyLock<ThemeRules> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../community-themes/rules.json"))
        .expect("community theme rules must be valid JSON")
});
/// A theme folder can only be installed after the native picker selected it.
/// The selection expires after 30 seconds to prevent stale paths.
const PICKED_FOLDER_TIMEOUT: Duration = Duration::from_secs(30);
static PICKED_THEME_FOLDER: Mutex<Option<(PathBuf, Instant)>> = Mutex::new(None);

/// The `manifest.json` of a theme.
///
/// Only `id` and `name` are required, everything else is optional and only
/// used to describe the theme.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "types.ts")]
pub struct ThemeManifest {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub license: Option<String>,
    /// "dark", "light" or "both".
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    /// The theme format the theme was written against.
    #[serde(default)]
    pub api: Option<u32>,
    /// The stylesheet of the theme, relative to the theme folder.
    #[serde(default)]
    pub css: Option<String>,
}

/// The mode a theme asks for.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export, export_to = "types.ts")]
pub enum ThemeMode {
    Dark,
    Light,
    Both,
}

/// A theme, ready to be applied.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "types.ts")]
pub struct ThemeBundle {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub version: Option<String>,
    pub license: Option<String>,
    pub mode: ThemeMode,
    pub tags: Vec<String>,
    pub css: String,
}

/// A theme listed in the static community catalog.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommunityTheme {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub version: Option<String>,
    pub license: Option<String>,
    pub mode: ThemeMode,
    pub tags: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ThemeCatalog {
    api: u32,
    themes: Vec<ThemeCatalogEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ThemeCatalogEntry {
    id: String,
    name: String,
    #[serde(default)]
    version: Option<String>,
    #[serde(default)]
    author: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    license: Option<String>,
    #[serde(default)]
    mode: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
    api: u32,
}

/// The folder the themes live in.
fn themes_dir(app: &AppHandle) -> Result<PathBuf, YapmodError> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|e| YapmodError::io(e.to_string()))?
        .join("themes"))
}

/// A theme id ends up in a path, so it is kept boring on purpose.
fn is_valid_id(id: &str) -> bool {
    !id.is_empty()
        && !id.starts_with('.')
        && id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "-_.".contains(character))
}

/// A stylesheet inside a theme folder may not point somewhere else.
fn is_valid_file_name(name: &str) -> bool {
    !name.is_empty()
        && !name.starts_with('.')
        && !name.contains('/')
        && !name.contains('\\')
        && !name.contains("..")
}

/// Community files use the narrower name accepted by the catalog builder.
fn is_valid_community_file_name(name: &str) -> bool {
    !name.is_empty()
        && !name.contains("..")
        && name
            .chars()
            .next()
            .is_some_and(|character| character.is_ascii_alphanumeric())
        && name
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "-_.".contains(character))
}

/// Downloads one file from the fixed static theme host with a size limit.
async fn fetch_community_asset(path: &str, max_bytes: usize) -> Result<Vec<u8>, YapmodError> {
    let url = format!("{COMMUNITY_THEMES_BASE}/{path}");
    http::fetch(&url, max_bytes, Duration::from_secs(20))
        .await
        .map_err(|error| {
            YapmodError::network(format!("could not download the community theme: {error}"))
        })?
        .ok_or_else(|| YapmodError::not_found("the community theme file was not found"))
}

/// Loads the static catalog used by the community theme browser.
#[tauri::command]
pub async fn list_community_themes() -> Result<Vec<CommunityTheme>, YapmodError> {
    let bytes = fetch_community_asset("index.json", THEME_RULES.max_catalog_bytes).await?;
    let catalog: ThemeCatalog = serde_json::from_slice(&bytes).map_err(|error| {
        YapmodError::validation(format!("the community theme catalog is invalid: {error}"))
    })?;

    if catalog.api > THEME_RULES.theme_api {
        return Err(YapmodError::validation(format!(
            "the community catalog needs theme API {}, this version understands {}",
            catalog.api, THEME_RULES.theme_api
        )));
    }

    let mut ids = HashSet::new();
    let mut themes = Vec::new();

    for theme in catalog.themes {
        if !is_valid_id(&theme.id) || !ids.insert(theme.id.clone()) {
            return Err(YapmodError::validation(
                "the community theme catalog contains an invalid or duplicate id",
            ));
        }

        if theme.api > THEME_RULES.theme_api {
            continue;
        }

        if theme.name.trim().is_empty() {
            return Err(YapmodError::validation(format!(
                "community theme `{}` has an invalid name",
                theme.id
            )));
        }

        themes.push(CommunityTheme {
            id: theme.id,
            name: theme.name,
            description: theme.description,
            author: theme.author,
            version: theme.version,
            license: theme.license,
            mode: normalize_mode(theme.mode.as_deref()),
            tags: theme.tags,
        });
    }

    themes.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then(left.id.cmp(&right.id))
    });

    Ok(themes)
}

/// Downloads and installs one theme from the static community catalog.
#[tauri::command]
pub async fn install_community_theme(
    app: AppHandle,
    id: String,
) -> Result<ThemeBundle, YapmodError> {
    if !is_valid_id(&id) {
        return Err(YapmodError::validation("that is not a valid theme id"));
    }

    let manifest_path = format!("themes/{id}/{MANIFEST_FILE}");
    let manifest_bytes =
        fetch_community_asset(&manifest_path, THEME_RULES.max_manifest_bytes).await?;
    let manifest: ThemeManifest = serde_json::from_slice(&manifest_bytes).map_err(|error| {
        YapmodError::validation(format!("the community theme manifest is invalid: {error}"))
    })?;

    if manifest.id != id {
        return Err(YapmodError::validation(
            "the downloaded theme id does not match the catalog",
        ));
    }

    if manifest.name.trim().is_empty() {
        return Err(YapmodError::validation(
            "the community theme has an invalid name",
        ));
    }

    if let Some(api) = manifest.api
        && api > THEME_RULES.theme_api
    {
        return Err(YapmodError::validation(format!(
            "the theme was written for theme API {api}, this version understands {}",
            THEME_RULES.theme_api
        )));
    }

    let css_file = manifest.css.as_deref().unwrap_or(DEFAULT_CSS_FILE);

    if !is_valid_community_file_name(css_file) {
        return Err(YapmodError::validation(
            "the theme manifest points at an unusable stylesheet",
        ));
    }

    let css_path = format!("themes/{id}/{css_file}");
    let css = String::from_utf8(fetch_community_asset(&css_path, THEME_RULES.max_css_bytes).await?)
        .map_err(|_| {
            YapmodError::validation("the community theme stylesheet is not valid UTF-8")
        })?;

    let target = themes_dir(&app)?.join(&id);

    if target.exists() {
        return Err(YapmodError::already_exists(
            "a theme with this id is already installed; remove it first",
        ));
    }

    install_theme_folder(&target, |target| {
        fs::write(target.join(MANIFEST_FILE), &manifest_bytes)
            .map_err(|e| YapmodError::io(e.to_string()))?;
        fs::write(target.join(css_file), css).map_err(|e| YapmodError::io(e.to_string()))?;

        Ok(())
    })
}

/// The mode a theme asks for, with everything unknown treated as dark.
fn normalize_mode(mode: Option<&str>) -> ThemeMode {
    match mode {
        Some("light") => ThemeMode::Light,
        Some("both") => ThemeMode::Both,
        _ => ThemeMode::Dark,
    }
}

/// Reads a theme folder into a bundle.
///
/// A folder that cannot be read is not a theme, so this returns nothing
/// instead of failing.
fn read_bundle(folder: &Path) -> Option<ThemeBundle> {
    let contents = fs::read_to_string(folder.join(MANIFEST_FILE)).ok()?;
    let manifest: ThemeManifest = serde_json::from_str(&contents).ok()?;

    if !is_valid_id(&manifest.id) {
        return None;
    }

    let css_file = manifest.css.as_deref().unwrap_or(DEFAULT_CSS_FILE);

    if !is_valid_file_name(css_file) {
        return None;
    }

    let css = fs::read_to_string(folder.join(css_file)).unwrap_or_default();

    Some(ThemeBundle {
        id: manifest.id,
        name: manifest.name,
        description: manifest.description,
        author: manifest.author,
        version: manifest.version,
        license: manifest.license,
        mode: normalize_mode(manifest.mode.as_deref()),
        tags: manifest.tags,
        css,
    })
}

/// Copies a folder, so a theme can be installed from anywhere.
fn copy_folder(source: &Path, target: &Path) -> Result<(), YapmodError> {
    fs::create_dir_all(target).map_err(|e| YapmodError::io(e.to_string()))?;

    for entry in fs::read_dir(source).map_err(|e| YapmodError::io(e.to_string()))? {
        let entry = entry.map_err(|e| YapmodError::io(e.to_string()))?;
        let path = entry.path();
        let destination = target.join(entry.file_name());

        if fs::symlink_metadata(&path)
            .map_err(|e| YapmodError::io(e.to_string()))?
            .file_type()
            .is_symlink()
        {
            return Err(YapmodError::validation(format!(
                "theme folder contains a symbolic link: {}",
                path.display()
            )));
        }

        if path.is_dir() {
            copy_folder(&path, &destination)?;
        } else {
            fs::copy(&path, &destination).map_err(|e| YapmodError::io(e.to_string()))?;
        }
    }

    Ok(())
}

/// Creates an installed theme folder, populates it, and removes partial output
/// if copying, writing, or reading the theme back fails.
fn install_theme_folder(
    target: &Path,
    populate: impl FnOnce(&Path) -> Result<(), YapmodError>,
) -> Result<ThemeBundle, YapmodError> {
    let parent = target
        .parent()
        .ok_or_else(|| YapmodError::io("the theme folder has no parent"))?;
    fs::create_dir_all(parent).map_err(|e| YapmodError::io(e.to_string()))?;
    fs::create_dir(target).map_err(|e| YapmodError::io(e.to_string()))?;

    let install_result = (|| {
        populate(target)?;
        read_bundle(target)
            .ok_or_else(|| YapmodError::io("the theme could not be read back".to_string()))
    })();

    if install_result.is_err() {
        let _ = fs::remove_dir_all(target);
    }

    install_result
}

/// Turns a path the user typed into a real one.
fn expand_home(path: &str) -> PathBuf {
    let trimmed = path.trim();

    if let Some(rest) = trimmed.strip_prefix("~/")
        && let Some(home) = home_dir()
    {
        return home.join(rest);
    }

    if trimmed == "~"
        && let Some(home) = home_dir()
    {
        return home;
    }

    PathBuf::from(trimmed)
}

/// The home folder of the user.
fn home_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    let home = std::env::var("USERPROFILE").ok();

    #[cfg(not(target_os = "windows"))]
    let home = std::env::var("HOME").ok();

    home.map(PathBuf::from)
}

/// The theme the user picked, if there is one.
///
/// This is resolved once at startup and handed to the page, so the theme is
/// already in place when the first frame is painted.
pub fn active_theme(app: &AppHandle, config: &Config) -> Option<ThemeBundle> {
    let id = config.setting_str("theme_id")?;

    if id.is_empty() {
        return None;
    }

    let folder = themes_dir(app).ok()?.join(id);

    // Only CSS is needed to apply the selected theme before the first frame.
    read_bundle(&folder)
}

/// Reads an installed theme again so local edits can be picked up without
/// reinstalling. The id is validated before it is joined into a path.
#[tauri::command]
pub fn reload_theme(app: AppHandle, id: String) -> Result<ThemeBundle, YapmodError> {
    if !is_valid_id(&id) {
        return Err(YapmodError::validation("that is not a valid theme id"));
    }
    let folder = themes_dir(&app)?.join(&id);
    let bundle = read_bundle(&folder)
        .ok_or_else(|| YapmodError::not_found("the theme files could not be read"))?;
    if bundle.id != id {
        return Err(YapmodError::validation(
            "the theme folder declares a different id",
        ));
    }
    Ok(bundle)
}

/// Every theme that is installed.
#[tauri::command]
pub fn list_themes(app: AppHandle) -> Result<Vec<ThemeBundle>, YapmodError> {
    let folder = themes_dir(&app)?;
    let mut themes = Vec::new();

    let entries = match fs::read_dir(&folder) {
        Ok(entries) => entries,
        Err(_) => return Ok(themes),
    };

    for entry in entries.flatten() {
        let path = entry.path();

        if !path.is_dir() {
            continue;
        }

        if let Some(bundle) = read_bundle(&path) {
            themes.push(bundle);
        }
    }

    themes.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then(left.id.cmp(&right.id))
    });

    Ok(themes)
}

/// The folder the themes live in, so the user can put themes there.
#[tauri::command]
pub fn themes_folder(app: AppHandle) -> Result<String, YapmodError> {
    let folder = themes_dir(&app)?;

    fs::create_dir_all(&folder).map_err(|e| YapmodError::io(e.to_string()))?;

    Ok(folder.to_string_lossy().to_string())
}

/// Opens the theme folder in the file manager.
#[tauri::command]
pub fn open_themes_folder(app: AppHandle) -> Result<(), YapmodError> {
    let folder = themes_dir(&app)?;

    fs::create_dir_all(&folder).map_err(|e| YapmodError::io(e.to_string()))?;

    app.opener()
        .open_path(folder.to_string_lossy().to_string(), None::<&str>)
        .map_err(|error| YapmodError::system(error.to_string()))
}

/// Opens the folder picker, so the user can choose a theme to install.
///
/// The picker starts in the themes folder, and returns nothing when the
/// user closes it.
#[tauri::command]
pub async fn pick_theme_folder(app: AppHandle) -> Result<Option<String>, YapmodError> {
    // Clear any previously stored path so a cancelled picker does not leave a stale value.
    *PICKED_THEME_FOLDER
        .lock()
        .map_err(|_| YapmodError::system("theme folder selection is unavailable"))? = None;
    let folder = themes_dir(&app)?;

    fs::create_dir_all(&folder).map_err(|e| YapmodError::io(e.to_string()))?;

    let selected = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Import a theme")
            .set_directory(&folder)
            .blocking_pick_folder()
            .map(|path| path.to_string())
    })
    .await
    .map_err(|e| YapmodError::io(e.to_string()))?;

    let canonical = selected
        .as_deref()
        .and_then(|path| expand_home(path).canonicalize().ok());
    *PICKED_THEME_FOLDER
        .lock()
        .map_err(|_| YapmodError::system("theme folder selection is unavailable"))? =
        canonical.map(|p| (p, Instant::now()));

    Ok(selected)
}

/// Installs a theme from a folder somewhere else on the disk.
#[tauri::command]
pub fn install_theme(app: AppHandle, source: String) -> Result<ThemeBundle, YapmodError> {
    let source = expand_home(&source)
        .canonicalize()
        .map_err(|e| YapmodError::io(e.to_string()))?;

    let (picked, picked_at) = PICKED_THEME_FOLDER
        .lock()
        .map_err(|_| YapmodError::system("theme folder selection is unavailable"))?
        .take()
        .ok_or_else(|| {
            YapmodError::validation("choose a theme folder using the native picker first")
        })?;
    if picked_at.elapsed() > PICKED_FOLDER_TIMEOUT {
        return Err(YapmodError::validation(
            "the theme selection has expired; please choose the folder again",
        ));
    }

    if source != picked {
        return Err(YapmodError::validation(
            "the selected theme folder does not match the native picker",
        ));
    }

    if !source.is_dir() {
        return Err(YapmodError::validation(format!(
            "`{}` is not a folder that holds a theme",
            source.to_string_lossy()
        )));
    }

    let contents = fs::read_to_string(source.join(MANIFEST_FILE))
        .map_err(|_| YapmodError::not_found("the folder has no manifest.json"))?;

    let manifest: ThemeManifest = serde_json::from_str(&contents)
        .map_err(|error| YapmodError::validation(format!("the manifest is not valid: {error}")))?;

    if !is_valid_id(&manifest.id) {
        return Err(YapmodError::validation("the manifest has no usable id"));
    }

    if let Some(api) = manifest.api
        && api > THEME_RULES.theme_api
    {
        return Err(YapmodError::validation(format!(
            "the theme was written for theme API {api}, this version understands {}",
            THEME_RULES.theme_api
        )));
    }

    let css_file = manifest.css.as_deref().unwrap_or(DEFAULT_CSS_FILE);

    if !is_valid_file_name(css_file) {
        return Err(YapmodError::validation(
            "the manifest points at an unusable stylesheet",
        ));
    }

    if !source.join(css_file).is_file() {
        return Err(YapmodError::not_found(format!(
            "the folder has no `{css_file}`"
        )));
    }

    let target = themes_dir(&app)?.join(&manifest.id);

    if target.exists() {
        return Err(YapmodError::already_exists(
            "a theme with this id is already installed; remove it first",
        ));
    }

    install_theme_folder(&target, |target| copy_folder(&source, target))
}

/// Removes an installed community theme and installs the latest version from
/// the catalog in one atomic operation. Returns the new bundle on success.
#[tauri::command]
pub async fn update_community_theme(
    app: AppHandle,
    id: String,
) -> Result<ThemeBundle, YapmodError> {
    if !is_valid_id(&id) {
        return Err(YapmodError::validation("that is not a valid theme id"));
    }

    // Fetch the latest manifest from the catalog
    let manifest_path = format!("themes/{id}/{MANIFEST_FILE}");
    let manifest_bytes =
        fetch_community_asset(&manifest_path, THEME_RULES.max_manifest_bytes).await?;
    let manifest: ThemeManifest = serde_json::from_slice(&manifest_bytes).map_err(|error| {
        YapmodError::validation(format!("the community theme manifest is invalid: {error}"))
    })?;

    if manifest.id != id {
        return Err(YapmodError::validation(
            "the downloaded theme id does not match the catalog",
        ));
    }

    if manifest.name.trim().is_empty() {
        return Err(YapmodError::validation(
            "the community theme has an invalid name",
        ));
    }

    if let Some(api) = manifest.api
        && api > THEME_RULES.theme_api
    {
        return Err(YapmodError::validation(format!(
            "the theme was written for theme API {api}, this version understands {}",
            THEME_RULES.theme_api
        )));
    }

    let css_file = manifest.css.as_deref().unwrap_or(DEFAULT_CSS_FILE);

    if !is_valid_community_file_name(css_file) {
        return Err(YapmodError::validation(
            "the theme manifest points at an unusable stylesheet",
        ));
    }

    let css_path = format!("themes/{id}/{css_file}");
    let css = String::from_utf8(fetch_community_asset(&css_path, THEME_RULES.max_css_bytes).await?)
        .map_err(|_| {
            YapmodError::validation("the community theme stylesheet is not valid UTF-8")
        })?;

    // Remove the old installation
    let target = themes_dir(&app)?.join(&id);
    if target.exists() {
        let _ = fs::remove_dir_all(&target);
    }

    // Clear the active theme if it was the one being updated
    if let Ok(mut config) = Config::load(&app)
        && config.setting_str("theme_id") == Some(id.as_str())
    {
        config.settings.remove("theme_id");
        let _ = Config::save(&app, &config);
    }

    // Install the new version
    install_theme_folder(&target, |target| {
        fs::write(target.join(MANIFEST_FILE), &manifest_bytes)
            .map_err(|e| YapmodError::io(e.to_string()))?;
        fs::write(target.join(css_file), css).map_err(|e| YapmodError::io(e.to_string()))?;
        Ok(())
    })
}

/// Removes an installed theme.
#[tauri::command]
pub fn remove_theme(app: AppHandle, id: String) -> Result<(), YapmodError> {
    if !is_valid_id(&id) {
        return Err(YapmodError::validation("that is not a valid theme id"));
    }

    let folder = themes_dir(&app)?.join(&id);

    if folder.exists() {
        fs::remove_dir_all(&folder).map_err(|e| YapmodError::io(e.to_string()))?;
    }

    // A removed theme cannot stay selected.
    let mut config = Config::load(&app).map_err(|e| YapmodError::io(e.to_string()))?;

    if config.setting_str("theme_id") == Some(id.as_str()) {
        config.settings.remove("theme_id");
        Config::save(&app, &config).map_err(|e| YapmodError::io(e.to_string()))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{ThemeMode, is_valid_file_name, is_valid_id, normalize_mode, read_bundle};

    /// A folder with a theme in it, removed when the test is done.
    fn theme_folder(name: &str, manifest: &str, css: Option<&str>) -> std::path::PathBuf {
        let folder = std::env::temp_dir().join(format!("yapmod-theme-test-{name}"));

        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).unwrap();
        fs::write(folder.join("manifest.json"), manifest).unwrap();

        if let Some(css) = css {
            fs::write(folder.join("theme.css"), css).unwrap();
        }

        folder
    }

    #[test]
    fn reads_a_theme_folder() {
        let folder = theme_folder(
            "read",
            r#"{"id":"midnight","name":"Midnight","mode":"light","tags":["dark"]}"#,
            Some(":root { --ym-accent: #123456; }"),
        );

        let bundle = read_bundle(&folder).unwrap();

        assert_eq!(bundle.id, "midnight");
        assert_eq!(bundle.name, "Midnight");
        assert_eq!(bundle.mode, ThemeMode::Light);
        assert_eq!(bundle.tags, vec!["dark".to_string()]);
        assert!(bundle.css.contains("#123456"));

        let _ = fs::remove_dir_all(&folder);
    }

    #[test]
    fn ignores_a_folder_without_a_manifest() {
        let folder = theme_folder("broken", "not json", Some(""));

        assert!(read_bundle(&folder).is_none());

        let _ = fs::remove_dir_all(&folder);
    }

    #[test]
    fn ignores_a_manifest_without_a_name() {
        let folder = theme_folder("nameless", r#"{"id":"nameless"}"#, Some(""));

        assert!(read_bundle(&folder).is_none());

        let _ = fs::remove_dir_all(&folder);
    }

    #[test]
    fn keeps_ids_boring() {
        assert!(is_valid_id("midnight-blurple"));
        assert!(is_valid_id("theme_2"));
        assert!(!is_valid_id(""));
        assert!(!is_valid_id("../etc"));
        assert!(!is_valid_id(".hidden"));
        assert!(!is_valid_id("with/slash"));
    }

    #[test]
    fn keeps_stylesheets_inside_the_theme() {
        assert!(is_valid_file_name("theme.css"));
        assert!(!is_valid_file_name("../theme.css"));
        assert!(!is_valid_file_name("nested/theme.css"));
        assert!(!is_valid_file_name(".env"));
    }

    #[test]
    fn falls_back_to_dark() {
        assert_eq!(normalize_mode(Some("light")), ThemeMode::Light);
        assert_eq!(normalize_mode(Some("both")), ThemeMode::Both);
        assert_eq!(normalize_mode(Some("nonsense")), ThemeMode::Dark);
        assert_eq!(normalize_mode(None), ThemeMode::Dark);
    }
}
