//! Shared image MIME mapping and data-URI encoding for files sent to the client.

use base64::Engine;

/// Returns the MIME type of an image extension (without the dot, case-insensitive).
pub fn image_mime(extension: &str) -> Option<&'static str> {
    match extension.to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "svg" => Some("image/svg+xml"),
        "bmp" => Some("image/bmp"),
        "ico" => Some("image/x-icon"),
        "avif" => Some("image/avif"),
        _ => None,
    }
}

/// Encodes bytes as a base64 data URI.
pub fn data_uri(mime: &str, bytes: &[u8]) -> String {
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    format!("data:{mime};base64,{encoded}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_known_image_extensions() {
        assert_eq!(image_mime("PNG"), Some("image/png"));
        assert_eq!(image_mime("jpeg"), Some("image/jpeg"));
        assert_eq!(image_mime("svg"), Some("image/svg+xml"));
        assert_eq!(image_mime("unknown"), None);
    }

    #[test]
    fn encodes_data_uris() {
        assert_eq!(data_uri("image/png", b"hi"), "data:image/png;base64,aGk=");
    }
}
