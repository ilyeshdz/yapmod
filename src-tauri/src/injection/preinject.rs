use serde::Serialize;
use ts_rs::TS;

use crate::config::Config;
use crate::hosts::INTERNAL_HOST;
use crate::theme::ThemeBundle;

use super::release::{ReleaseInfo, notes_for};
use super::{ClientBundle, assets::PREINJECT_JS};

/// The payload the preinject bundle reads.
///
/// Everything the injected code needs to know about the app is in here, so
/// there is a single global to look at.
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "types.ts")]
pub struct Payload {
    pub config: Config,
    pub os: String,
    pub internal_host: String,
    /// Version of the injected client bundle. This is distinct from the
    /// desktop application's release version.
    pub client_version: String,
    pub release: ReleaseInfo,
    /// The theme the user picked, already loaded so it can be applied
    /// before the first frame is painted.
    pub theme: Option<ThemeBundle>,
}

pub fn preinject(
    config: &Config,
    first_run: bool,
    version: &str,
    previous_version: Option<&str>,
    theme: Option<ThemeBundle>,
    client_bundle: Option<&ClientBundle>,
) -> String {
    let client_version = client_bundle
        .map(|bundle| bundle.client_version.clone())
        .unwrap_or_else(embedded_client_version);
    let payload = Payload {
        config: config.clone(),
        os: std::env::consts::OS.to_string(),
        internal_host: INTERNAL_HOST.to_string(),
        client_version,
        release: ReleaseInfo {
            version: version.to_string(),
            previous_version: previous_version.map(str::to_string),
            first_run,
            notes: notes_for(version),
        },
        theme,
    };

    let payload = serde_json::to_string(&payload).expect("payload must be valid JSON");

    let script = client_bundle
        .map(|bundle| bundle.preinject.as_str())
        .unwrap_or(PREINJECT_JS.as_str());

    format!(
        "if (window.top === window && ({})) {{ window.__YAPMOD__ = {payload};\n{script}\n}}",
        crate::hosts::INJECTION_ORIGINS
            .iter()
            .map(|origin| format!("location.origin === {origin:?}"))
            .collect::<Vec<_>>()
            .join(" || ")
    )
}

fn embedded_client_version() -> String {
    #[derive(serde::Deserialize)]
    struct VersionFile {
        version: String,
    }

    serde_json::from_str::<VersionFile>(include_str!("../../../client/version.json"))
        .expect("client/version.json must contain a version")
        .version
}
