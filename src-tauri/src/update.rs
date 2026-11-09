use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;
use ts_rs::TS;

use crate::error::YapmodError;
use crate::{http, version::is_newer};

const RELEASES_API: &str = "https://api.github.com/repos/ilyeshdz/yapmod/releases/latest";
const REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);
const MAX_RELEASE_SIZE: usize = 512 * 1024;

/// The update information the injected UI needs.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "types.ts")]
pub struct UpdateInfo {
    /// The version that is running right now.
    pub current_version: String,
    /// The newest published release.
    pub latest_version: String,
    /// Whether the published version is newer than the running one.
    pub available: bool,
    /// Where the user can download the update.
    pub release_url: String,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    #[serde(default)]
    html_url: Option<String>,
}

async fn latest_stable_release() -> Result<(String, String), YapmodError> {
    let release: GithubRelease = http::fetch_json(RELEASES_API, MAX_RELEASE_SIZE, REQUEST_TIMEOUT)
        .await
        .map_err(YapmodError::network)?;

    let version = release.tag_name.trim_start_matches('v').to_owned();
    if semver::Version::parse(&version).is_err() {
        return Err(YapmodError::validation(
            "the published stable version is invalid",
        ));
    }

    let url = release
        .html_url
        .unwrap_or_else(|| "https://github.com/ilyeshdz/yapmod/releases/latest".to_string());

    Ok((version, url))
}

/// Looks up the newest published release.
///
/// Returns metadata so the UI can decide whether to prompt the user to
/// download and install the update via `install_app_update`.
#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<UpdateInfo, YapmodError> {
    let current_version = app.package_info().version.to_string();
    let (latest_version, release_url) = latest_stable_release().await?;

    Ok(UpdateInfo {
        available: is_newer(&latest_version, &current_version),
        current_version,
        latest_version,
        release_url,
    })
}

/// Downloads and installs the latest app update using Tauri's built-in updater.
///
/// The updater fetches the signed manifest, verifies the download hash, replaces
/// the current app bundle, and restarts the application automatically.
#[tauri::command]
pub async fn install_app_update(app: AppHandle) -> Result<(), String> {
    let updater = app
        .updater()
        .map_err(|error| format!("updater not configured: {error}"))?;

    let Some(update) = updater
        .check()
        .await
        .map_err(|error| format!("failed to check for update: {error}"))?
    else {
        return Err("no update available".to_string());
    };

    update
        .download_and_install(
            |chunk_length, content_length| {
                eprintln!(
                    "update download: {} from {:?}",
                    chunk_length, content_length
                );
            },
            || {
                eprintln!("update download finished");
            },
        )
        .await
        .map_err(|error| format!("download and install failed: {error}"))?;

    app.restart();
}

/// Spawns a background task that checks for app updates periodically.
///
/// Starts with a 6-hour interval and doubles on each consecutive failure
/// (exponential backoff) up to 24 hours. Resets on success. Stops after
/// reaching the maximum interval until the next app launch.
pub fn spawn_update_checker(app: AppHandle) {
    let base_interval = Duration::from_secs(6 * 60 * 60);
    let max_interval = Duration::from_secs(24 * 60 * 60);

    tokio::spawn(async move {
        let mut current_interval = base_interval;

        loop {
            tokio::time::sleep(current_interval).await;

            match check_for_update(app.clone()).await {
                Ok(info) => {
                    if info.available {
                        eprintln!("background check: update {} available", info.latest_version);
                    }
                    current_interval = base_interval;
                }
                Err(error) => {
                    eprintln!("background update check failed: {}", error);
                    current_interval = (current_interval * 2).min(max_interval);
                    if current_interval >= max_interval {
                        eprintln!(
                            "stopping background update checker after reaching max interval ({:?})",
                            max_interval
                        );
                        break;
                    }
                }
            }
        }
    });
}
