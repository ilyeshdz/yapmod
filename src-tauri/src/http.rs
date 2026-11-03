use std::{sync::LazyLock, time::Duration};

use reqwest::Client;
use serde::de::DeserializeOwned;

const USER_AGENT: &str = concat!("yapmod/", env!("CARGO_PKG_VERSION"));

/// Shared client for all HTTP requests made by the Rust application.
///
/// Reqwest clients own a reusable connection pool, so callers should use this
/// client instead of building a new one for each request.
static CLIENT: LazyLock<Client> = LazyLock::new(|| {
    Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .expect("the shared HTTP client must be configurable")
});

pub fn client() -> &'static Client {
    &CLIENT
}

/// Downloads a resource with a hard size limit.
///
/// Returns `Ok(None)` when the server answers `404`, which callers use to
/// distinguish "not published yet" from a real failure. The body is read
/// incrementally so an oversized response is rejected without buffering it.
pub async fn fetch(url: &str, limit: usize, timeout: Duration) -> Result<Option<Vec<u8>>, String> {
    let mut response = client()
        .get(url)
        .timeout(timeout)
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(format!("download failed with status {}", response.status()));
    }
    if response
        .content_length()
        .is_some_and(|length| length > limit as u64)
    {
        return Err("download exceeds the permitted size".to_string());
    }

    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|error| error.to_string())? {
        if bytes.len().saturating_add(chunk.len()) > limit {
            return Err("download exceeds the permitted size".to_string());
        }
        bytes.extend_from_slice(&chunk);
    }

    Ok(Some(bytes))
}

/// Downloads and parses a JSON document with a hard size limit.
pub async fn fetch_json<T: DeserializeOwned>(
    url: &str,
    limit: usize,
    timeout: Duration,
) -> Result<T, String> {
    let bytes = fetch(url, limit, timeout)
        .await?
        .ok_or_else(|| "the resource was not found".to_string())?;
    serde_json::from_slice(&bytes).map_err(|error| error.to_string())
}
