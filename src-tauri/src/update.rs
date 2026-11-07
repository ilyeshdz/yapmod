use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;
use ts_rs::TS;

use crate::{channel::UpdateChannel, http, version::is_newer};

const RELEASES_API: &str = "https://api.github.com/repos/ilyeshdz/yapmod/releases/latest";
const NIGHTLY_RELEASE_API: &str =
    "https://api.github.com/repos/ilyeshdz/yapmod/releases/tags/nightly";
const NIGHTLY_RELEASE_PAGE: &str = "https://github.com/ilyeshdz/yapmod/releases/tag/nightly";
const NIGHTLY_VERSION_ASSET: &str = "yapmod-version.json";
const REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);
const MAX_RELEASE_SIZE: usize = 512 * 1024;
const MAX_VERSION_ASSET_SIZE: usize = 4096;

/// The update information the injected UI needs.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "types.ts")]
pub struct UpdateInfo {
    /// The version that is running right now.
    pub current_version: String,
    /// The newest version published on this installation's channel.
    pub latest_version: String,
    /// Whether the published version is newer than the running one.
    pub available: bool,
    /// The channel this installation follows.
    pub channel: UpdateChannel,
    /// Where the user can download the update.
    pub release_url: String,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    #[serde(default)]
    html_url: Option<String>,
    #[serde(default)]
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

/// The small asset written next to every rolling nightly release.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct NightlyVersion {
    channel: UpdateChannel,
    app_version: String,
}

fn parse_nightly_version(bytes: &[u8]) -> Result<String, String> {
    let version: NightlyVersion =
        serde_json::from_slice(bytes).map_err(|error| error.to_string())?;
    if version.channel != UpdateChannel::Nightly {
        return Err("the nightly version metadata belongs to another channel".to_string());
    }
    if semver::Version::parse(&version.app_version).is_err() {
        return Err("the nightly version metadata is invalid".to_string());
    }

    Ok(version.app_version)
}

async fn latest_stable_release() -> Result<(String, String), String> {
    let release: GithubRelease =
        http::fetch_json(RELEASES_API, MAX_RELEASE_SIZE, REQUEST_TIMEOUT).await?;

    let version = release.tag_name.trim_start_matches('v').to_owned();
    if semver::Version::parse(&version).is_err() {
        return Err("the published stable version is invalid".to_string());
    }

    let url = release
        .html_url
        .unwrap_or_else(|| "https://github.com/ilyeshdz/yapmod/releases/latest".to_string());

    Ok((version, url))
}

async fn latest_nightly_version() -> Result<Option<String>, String> {
    let Some(bytes) = http::fetch(NIGHTLY_RELEASE_API, MAX_RELEASE_SIZE, REQUEST_TIMEOUT).await?
    else {
        return Ok(None);
    };
    let release: GithubRelease =
        serde_json::from_slice(&bytes).map_err(|error| error.to_string())?;

    let Some(asset) = release
        .assets
        .iter()
        .find(|asset| asset.name == NIGHTLY_VERSION_ASSET)
    else {
        // A nightly release from before channel metadata existed cannot be
        // compared safely. Treat it as unavailable instead of falling back to
        // the stable release.
        return Ok(None);
    };

    let Some(bytes) = http::fetch(
        &asset.browser_download_url,
        MAX_VERSION_ASSET_SIZE,
        REQUEST_TIMEOUT,
    )
    .await?
    else {
        return Err("the nightly version metadata is missing".to_string());
    };

    parse_nightly_version(&bytes).map(Some)
}

/// Looks up the newest published release on this installation's channel.
///
/// Returns metadata so the UI can decide whether to prompt the user to
/// download and install the update via `install_app_update`.
#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<UpdateInfo, String> {
    let current_version = app.package_info().version.to_string();
    let channel = UpdateChannel::active();

    let (latest_version, release_url) = match channel {
        UpdateChannel::Stable => latest_stable_release().await?,
        UpdateChannel::Nightly => (
            latest_nightly_version()
                .await?
                .unwrap_or_else(|| current_version.clone()),
            NIGHTLY_RELEASE_PAGE.to_string(),
        ),
    };

    Ok(UpdateInfo {
        available: is_newer(&latest_version, &current_version),
        current_version,
        latest_version,
        channel,
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
/// Checks every 6 hours with exponential backoff on failure. Stops after
/// 24+ hours of consecutive failures until the next app launch.
pub fn spawn_update_checker(app: AppHandle) {
    let interval = Duration::from_secs(6 * 60 * 60);
    let max_failures = 4u32; // 4 * 6h = 24h

    tokio::spawn(async move {
        let mut consecutive_failures = 0u32;

        loop {
            tokio::time::sleep(interval).await;

            match check_for_update(app.clone()).await {
                Ok(info) => {
                    if info.available {
                        eprintln!("background check: update {} available", info.latest_version);
                    }
                    consecutive_failures = 0;
                }
                Err(error) => {
                    consecutive_failures = consecutive_failures.saturating_add(1);
                    eprintln!(
                        "background update check failed ({}/{}): {}",
                        consecutive_failures, max_failures, error
                    );
                    if consecutive_failures >= max_failures {
                        eprintln!(
                            "stopping background update checker after {} consecutive failures",
                            consecutive_failures
                        );
                        break;
                    }
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::parse_nightly_version;
    use crate::channel::UpdateChannel;

    #[test]
    fn nightly_metadata_must_match_its_channel() {
        let nightly = br#"{"channel":"nightly","appVersion":"0.5.1+nightly.20261027.12"}"#;
        assert_eq!(
            parse_nightly_version(nightly).unwrap(),
            "0.5.1+nightly.20261027.12"
        );

        let stable = br#"{"channel":"stable","appVersion":"0.5.1"}"#;
        assert!(parse_nightly_version(stable).is_err());

        let invalid = br#"{"channel":"nightly","appVersion":"not-a-version"}"#;
        assert!(parse_nightly_version(invalid).is_err());
        assert!(parse_nightly_version(b"{}").is_err());
    }

    #[test]
    fn channels_serialize_with_the_manifest_names() {
        assert_eq!(
            serde_json::to_string(&UpdateChannel::Nightly).unwrap(),
            "\"nightly\""
        );
        assert_eq!(
            serde_json::to_string(&UpdateChannel::Stable).unwrap(),
            "\"stable\""
        );
    }
}
