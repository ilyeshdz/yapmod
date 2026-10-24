use std::sync::LazyLock;

use reqwest::Client;

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
