use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use ts_rs::TS;

use crate::{http, version::is_newer};

const RELEASES_API: &str = "https://api.github.com/repos/ilyeshdz/yapmod/releases/latest";
const REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);

/// The update information the injected UI needs.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "types.ts")]
pub struct UpdateInfo {
    /// The version that is running right now.
    pub current_version: String,
    /// The newest version published on GitHub.
    pub latest_version: String,
    /// Whether the published version is newer than the running one.
    pub available: bool,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
}

/// Looks up the newest published release.
///
/// yapmod never updates itself, so this only tells the user that a newer
/// version exists and where to get it.
#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<UpdateInfo, String> {
    let current_version = app.package_info().version.to_string();

    let response = http::client()
        .get(RELEASES_API)
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(format!(
            "the release lookup failed with status {}",
            response.status()
        ));
    }

    let release: GithubRelease = response.json().await.map_err(|error| error.to_string())?;

    let latest_version = release.tag_name.trim_start_matches('v').to_owned();

    Ok(UpdateInfo {
        available: is_newer(&latest_version, &current_version),
        current_version,
        latest_version,
    })
}
