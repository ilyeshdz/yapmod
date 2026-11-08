use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use ts_rs::TS;

use crate::error::YapmodError;
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

fn parse_nightly_version(bytes: &[u8]) -> Result<String, YapmodError> {
    let version: NightlyVersion = serde_json::from_slice(bytes).map_err(|error| {
        YapmodError::validation(format!("the nightly version metadata is invalid: {error}"))
    })?;
    if version.channel != UpdateChannel::Nightly {
        return Err(YapmodError::validation(
            "the nightly version metadata belongs to another channel",
        ));
    }
    if semver::Version::parse(&version.app_version).is_err() {
        return Err(YapmodError::validation(
            "the nightly version metadata is invalid",
        ));
    }

    Ok(version.app_version)
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

async fn latest_nightly_version() -> Result<Option<String>, YapmodError> {
    let Some(bytes) = http::fetch(NIGHTLY_RELEASE_API, MAX_RELEASE_SIZE, REQUEST_TIMEOUT)
        .await
        .map_err(YapmodError::network)?
    else {
        return Ok(None);
    };
    let release: GithubRelease = serde_json::from_slice(&bytes).map_err(|error| {
        YapmodError::validation(format!("the nightly release metadata is invalid: {error}"))
    })?;

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
    .await
    .map_err(YapmodError::network)?
    else {
        return Err(YapmodError::not_found(
            "the nightly version metadata is missing",
        ));
    };

    parse_nightly_version(&bytes).map(Some)
}

/// Looks up the newest published release on this installation's channel.
///
/// yapmod never updates itself, so this only tells the user that a newer
/// version exists and where to get it.
#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<UpdateInfo, YapmodError> {
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
