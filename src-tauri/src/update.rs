use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use ts_rs::TS;

use crate::{channel::UpdateChannel, http, version::is_newer};

const RELEASES_API: &str = "https://api.github.com/repos/ilyeshdz/yapmod/releases/latest";
const NIGHTLY_RELEASE_API: &str =
    "https://api.github.com/repos/ilyeshdz/yapmod/releases/tags/nightly";
const NIGHTLY_RELEASE_PAGE: &str = "https://github.com/ilyeshdz/yapmod/releases/tag/nightly";
const NIGHTLY_VERSION_ASSET: &str = "yapmod-version.json";
const REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);
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
    let response = http::client()
        .get(NIGHTLY_RELEASE_API)
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(format!(
            "the nightly release lookup failed with status {}",
            response.status()
        ));
    }

    let release: GithubRelease = response.json().await.map_err(|error| error.to_string())?;
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

    let response = http::client()
        .get(&asset.browser_download_url)
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "the nightly version download failed with status {}",
            response.status()
        ));
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_VERSION_ASSET_SIZE as u64)
    {
        return Err("the nightly version metadata is too large".to_string());
    }
    let bytes = response.bytes().await.map_err(|error| error.to_string())?;
    if bytes.len() > MAX_VERSION_ASSET_SIZE {
        return Err("the nightly version metadata is too large".to_string());
    }

    parse_nightly_version(&bytes).map(Some)
}

/// Looks up the newest published release on this installation's channel.
///
/// yapmod never updates itself, so this only tells the user that a newer
/// version exists and where to get it.
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
