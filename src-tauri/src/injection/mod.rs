mod assets;
mod postinject;
mod preinject;
pub mod release;

use serde::{Deserialize, Serialize};

pub use postinject::postinject;
pub use preinject::preinject;

/// The independently updated part of the client. Its shape is deliberately
/// kept flat so a release is just one small JSON artifact.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientBundle {
    pub client_version: String,
    pub release_sequence: u64,
    pub bridge_api_version: u32,
    pub min_app_version: String,
    pub preinject: String,
    pub postinject: String,
    pub minimum_css: String,
}
