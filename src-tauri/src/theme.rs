use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use ts_rs::TS;

use base64::Engine as _;

use crate::config::Config;

/// The version of the theme format this build understands.
///
/// A theme declares the version it was written against. Themes that need a
/// newer version are refused instead of being applied half-way.
pub const THEME_API: u32 = 1;

const MANIFEST_FILE: &str = "manifest.json";
const DEFAULT_CSS_FILE: &str = "theme.css";
pub const COMMUNITY_THEMES_BASE: &str = if cfg!(debug_assertions) {
    "http://127.0.0.1:4321/yapmod/community-themes"
} else {
    "https://ilyeshdz.github.io/yapmod/community-themes"
};
const MAX_CATALOG_BYTES: usize = 2 * 1024 * 1024;
const MAX_MANIFEST_BYTES: usize = 64 * 1024;
const MAX_CSS_BYTES: usize = 1024 * 1024;
const MAX_PREVIEW_BYTES: usize = 4 * 1024 * 1024;

/// A theme folder can only be installed after the native picker selected it.
static PICKED_THEME_FOLDER: Mutex<Option<PathBuf>> = Mutex::new(None);

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
    #[serde(default)]
    pub preview: Option<String>,
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
    /// A picture of the theme, as a data address.
    pub preview: Option<String>,
}

/// The folder the themes live in.
fn themes_dir(app: &AppHandle) -> Result<PathBuf, Box<dyn std::error::Error>> {
    Ok(app.path().app_config_dir()?.join("themes"))
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommunityThemeAsset {
    text: Option<String>,
    base64: Option<String>,
}

/// Downloads one bounded asset from the fixed community theme host.
///
/// This uses the native HTTP client so the remote HTTPS page can read the
/// local HTTP catalog in development without browser mixed-content or CORS
/// restrictions. The caller can only select a file within one theme folder.
#[tauri::command]
pub async fn fetch_community_theme_asset(
    id: Option<String>,
    file: String,
) -> Result<CommunityThemeAsset, String> {
    let (path, max_bytes, binary) = match id {
        None if file == "index.json" => ("index.json".to_string(), MAX_CATALOG_BYTES, false),
        Some(id) if is_valid_id(&id) && is_valid_file_name(&file) => {
            let max_bytes = if file == MANIFEST_FILE {
                MAX_MANIFEST_BYTES
            } else if has_supported_preview_extension(&file) {
                MAX_PREVIEW_BYTES
            } else {
                MAX_CSS_BYTES
            };
            (
                format!("themes/{id}/{file}"),
                max_bytes,
                has_supported_preview_extension(&file),
            )
        }
        _ => return Err("that is not a valid community theme asset".to_string()),
    };

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .get(format!("{COMMUNITY_THEMES_BASE}/{path}"))
        .send()
        .await
        .map_err(|error| format!("could not download the community theme: {error}"))?
        .error_for_status()
        .map_err(|error| format!("could not download the community theme: {error}"))?;

    if response
        .content_length()
        .is_some_and(|length| length > max_bytes as u64)
    {
        return Err("a community theme file is larger than the allowed size".to_string());
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("could not read the community theme: {error}"))?;
    if bytes.len() > max_bytes {
        return Err("a community theme file is larger than the allowed size".to_string());
    }

    if binary {
        Ok(CommunityThemeAsset {
            text: None,
            base64: Some(base64::engine::general_purpose::STANDARD.encode(bytes)),
        })
    } else {
        let text = String::from_utf8(bytes.to_vec())
            .map_err(|_| "the community theme file is not valid UTF-8".to_string())?;
        Ok(CommunityThemeAsset {
            text: Some(text),
            base64: None,
        })
    }
}

/// Writes validated theme files into the private themes directory.
///
/// The client owns community catalog access and downloads. This command stays
/// native because the theme must persist outside the remote web page and be
/// available before the next page's first paint.
#[tauri::command]
pub fn install_theme_content(
    app: AppHandle,
    manifest_json: String,
    css: String,
    preview_base64: Option<String>,
) -> Result<ThemeBundle, String> {
    if manifest_json.len() > MAX_MANIFEST_BYTES {
        return Err("the theme manifest is larger than the allowed size".to_string());
    }
    let manifest: ThemeManifest = serde_json::from_str(&manifest_json)
        .map_err(|error| format!("the theme manifest is invalid: {error}"))?;

    if !is_valid_id(&manifest.id) {
        return Err("the manifest has no usable id".to_string());
    }
    if manifest.name.trim().is_empty() || manifest.name.len() > 120 {
        return Err("the theme has an invalid name".to_string());
    }
    if let Some(api) = manifest.api
        && api > THEME_API
    {
        return Err(format!(
            "the theme was written for theme API {api}, this version understands {THEME_API}"
        ));
    }
    if css.len() > MAX_CSS_BYTES {
        return Err("the theme stylesheet is larger than the allowed size".to_string());
    }

    let css_file = manifest.css.as_deref().unwrap_or(DEFAULT_CSS_FILE);
    if !is_valid_file_name(css_file) {
        return Err("the theme manifest points at an unusable stylesheet".to_string());
    }

    let preview = match (manifest.preview.as_deref(), preview_base64) {
        (Some(name), Some(encoded)) => {
            if !is_valid_file_name(name) || !has_supported_preview_extension(name) {
                return Err("the theme manifest points at an unusable preview".to_string());
            }
            if encoded.len() > MAX_PREVIEW_BYTES.div_ceil(3) * 4 {
                return Err("the theme preview is larger than the allowed size".to_string());
            }
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(encoded)
                .map_err(|_| "the theme preview is not valid base64".to_string())?;
            if bytes.len() > MAX_PREVIEW_BYTES {
                return Err("the theme preview is larger than the allowed size".to_string());
            }
            Some((name.to_string(), bytes))
        }
        (None, None) => None,
        (Some(_), None) => return Err("the theme preview could not be downloaded".to_string()),
        (None, Some(_)) => return Err("the theme manifest has no preview file".to_string()),
    };

    let target = themes_dir(&app)
        .map_err(|error| error.to_string())?
        .join(&manifest.id);
    if target.exists() {
        return Err("a theme with this id is already installed; remove it first".to_string());
    }

    fs::create_dir_all(&target).map_err(|error| error.to_string())?;
    let install_result = (|| {
        fs::write(target.join(MANIFEST_FILE), manifest_json)?;
        fs::write(target.join(css_file), css)?;
        if let Some((preview_file, preview)) = preview {
            fs::write(target.join(preview_file), preview)?;
        }

        read_bundle(&target)
            .ok_or_else(|| std::io::Error::other("the downloaded theme could not be read back"))
    })();

    if install_result.is_err() {
        let _ = fs::remove_dir_all(&target);
    }

    install_result.map_err(|error| error.to_string())
}

fn has_supported_preview_extension(name: &str) -> bool {
    matches!(
        Path::new(name).extension().and_then(|extension| extension.to_str()),
        Some("png" | "jpg" | "jpeg" | "webp" | "gif" | "svg")
    )
}

/// The mode a theme asks for, with everything unknown treated as dark.
fn normalize_mode(mode: Option<&str>) -> ThemeMode {
    match mode {
        Some("light") => ThemeMode::Light,
        Some("both") => ThemeMode::Both,
        _ => ThemeMode::Dark,
    }
}

/// Reads the picture of a theme, if it has one.
fn read_preview(folder: &Path, name: Option<&str>) -> Option<String> {
    let name = name?;

    if !is_valid_file_name(name) {
        return None;
    }

    let mime = match Path::new(name)
        .extension()
        .and_then(|extension| extension.to_str())
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        Some("svg") => "image/svg+xml",
        _ => return None,
    };

    let bytes = fs::read(folder.join(name)).ok()?;

    Some(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
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
        preview: read_preview(folder, manifest.preview.as_deref()),
    })
}

/// Copies a folder, so a theme can be installed from anywhere.
fn copy_folder(source: &Path, target: &Path) -> Result<(), Box<dyn std::error::Error>> {
    fs::create_dir_all(target)?;

    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let path = entry.path();
        let destination = target.join(entry.file_name());

        if fs::symlink_metadata(&path)?.file_type().is_symlink() {
            return Err(
                format!("theme folder contains a symbolic link: {}", path.display()).into(),
            );
        }

        if path.is_dir() {
            copy_folder(&path, &destination)?;
        } else {
            fs::copy(&path, &destination)?;
        }
    }

    Ok(())
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

    read_bundle(&folder)
}

/// Every theme that is installed.
#[tauri::command]
pub fn list_themes(app: AppHandle) -> Result<Vec<ThemeBundle>, String> {
    let folder = themes_dir(&app).map_err(|error| error.to_string())?;
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
pub fn themes_folder(app: AppHandle) -> Result<String, String> {
    let folder = themes_dir(&app).map_err(|error| error.to_string())?;

    fs::create_dir_all(&folder).map_err(|error| error.to_string())?;

    Ok(folder.to_string_lossy().to_string())
}

/// Opens the theme folder in the file manager.
#[tauri::command]
pub fn open_themes_folder(app: AppHandle) -> Result<(), String> {
    let folder = themes_dir(&app).map_err(|error| error.to_string())?;

    fs::create_dir_all(&folder).map_err(|error| error.to_string())?;

    app.opener()
        .open_path(folder.to_string_lossy().to_string(), None::<&str>)
        .map_err(|error| error.to_string())
}

/// Opens the folder picker, so the user can choose a theme to install.
///
/// The picker starts in the themes folder, and returns nothing when the
/// user closes it.
#[tauri::command]
pub async fn pick_theme_folder(app: AppHandle) -> Result<Option<String>, String> {
    let folder = themes_dir(&app).map_err(|error| error.to_string())?;

    fs::create_dir_all(&folder).map_err(|error| error.to_string())?;

    let selected = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Import a theme")
            .set_directory(&folder)
            .blocking_pick_folder()
            .map(|path| path.to_string())
    })
    .await
    .map_err(|error| error.to_string())?;

    let canonical = selected
        .as_deref()
        .and_then(|path| expand_home(path).canonicalize().ok());
    *PICKED_THEME_FOLDER
        .lock()
        .map_err(|_| "theme folder selection is unavailable".to_string())? = canonical;

    Ok(selected)
}

/// Installs a theme from a folder somewhere else on the disk.
#[tauri::command]
pub fn install_theme(app: AppHandle, source: String) -> Result<ThemeBundle, String> {
    let source = expand_home(&source)
        .canonicalize()
        .map_err(|error| error.to_string())?;

    let picked = PICKED_THEME_FOLDER
        .lock()
        .map_err(|_| "theme folder selection is unavailable".to_string())?
        .take()
        .ok_or_else(|| "choose a theme folder using the native picker first".to_string())?;

    if source != picked {
        return Err("the selected theme folder does not match the native picker".to_string());
    }

    if !source.is_dir() {
        return Err(format!(
            "`{}` is not a folder that holds a theme",
            source.to_string_lossy()
        ));
    }

    let contents = fs::read_to_string(source.join(MANIFEST_FILE))
        .map_err(|_| "the folder has no manifest.json".to_string())?;

    let manifest: ThemeManifest = serde_json::from_str(&contents)
        .map_err(|error| format!("the manifest is not valid: {error}"))?;

    if !is_valid_id(&manifest.id) {
        return Err("the manifest has no usable id".to_string());
    }

    if let Some(api) = manifest.api
        && api > THEME_API
    {
        return Err(format!(
            "the theme was written for theme API {api}, this version understands {THEME_API}"
        ));
    }

    let css_file = manifest.css.as_deref().unwrap_or(DEFAULT_CSS_FILE);

    if !is_valid_file_name(css_file) {
        return Err("the manifest points at an unusable stylesheet".to_string());
    }

    if !source.join(css_file).is_file() {
        return Err(format!("the folder has no `{css_file}`"));
    }

    let target = themes_dir(&app)
        .map_err(|error| error.to_string())?
        .join(&manifest.id);

    if target.exists() {
        return Err("a theme with this id is already installed; remove it first".to_string());
    }

    // Installing a theme that already sits in the themes folder would copy
    // the folder onto itself, and take the theme with it.
    if let (Ok(source), Ok(target)) = (source.canonicalize(), target.canonicalize())
        && source == target
    {
        return Err("this theme is already installed".to_string());
    }

    if let Err(error) = copy_folder(&source, &target) {
        let _ = fs::remove_dir_all(&target);
        return Err(error.to_string());
    }

    read_bundle(&target).ok_or_else(|| "the theme could not be read back".to_string())
}

/// Removes an installed theme.
#[tauri::command]
pub fn remove_theme(app: AppHandle, id: String) -> Result<(), String> {
    if !is_valid_id(&id) {
        return Err("that is not a valid theme id".to_string());
    }

    let folder = themes_dir(&app)
        .map_err(|error| error.to_string())?
        .join(&id);

    if folder.exists() {
        fs::remove_dir_all(&folder).map_err(|error| error.to_string())?;
    }

    // A removed theme cannot stay selected.
    let mut config = Config::load(&app).map_err(|error| error.to_string())?;

    if config.setting_str("theme_id") == Some(id.as_str()) {
        config.settings.remove("theme_id");
        Config::save(&app, &config).map_err(|error| error.to_string())?;
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
