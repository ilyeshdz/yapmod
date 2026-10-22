/// The host that identifies the app itself.
///
/// The injected code gets the same host, so both sides agree on what counts
/// as an internal link.
pub const INTERNAL_HOST: &str = "yapper.website";

/// Origins allowed to host the Yapper page and use its native bridge. Keep
/// this list exact: a wildcard subdomain would grant every subdomain the
/// same Tauri command surface.
pub const INJECTION_ORIGINS: [&str; 2] = ["https://yapper.website", "https://www.yapper.website"];

/// Whether a host belongs to the app.
pub fn is_internal_host(host: &str) -> bool {
    let host = host.to_ascii_lowercase();

    host == INTERNAL_HOST || host.ends_with(&format!(".{INTERNAL_HOST}"))
}

/// Whether a URL stays on the app, so internal windows keep the default
/// behaviour and external ones are sent to the browser.
pub fn is_internal_url(url: &tauri::Url) -> bool {
    match url.host_str() {
        Some(host) => is_internal_host(host),
        None => true,
    }
}

/// The exact secure origins that are permitted to receive injected code.
pub fn is_injection_url(url: &tauri::Url) -> bool {
    url.scheme() == "https"
        && url.port().is_none_or(|port| port == 443)
        && url.host_str().is_some_and(|host| {
            host.eq_ignore_ascii_case("yapper.website")
                || host.eq_ignore_ascii_case("www.yapper.website")
        })
}

#[cfg(test)]
mod tests {
    use super::is_injection_url;

    #[test]
    fn permits_only_the_expected_secure_origins() {
        assert!(is_injection_url(
            &"https://www.yapper.website/".parse().unwrap()
        ));
        assert!(is_injection_url(
            &"https://yapper.website/".parse().unwrap()
        ));
        assert!(!is_injection_url(
            &"https://chat.yapper.website/".parse().unwrap()
        ));
        assert!(!is_injection_url(
            &"http://www.yapper.website/".parse().unwrap()
        ));
    }
}
