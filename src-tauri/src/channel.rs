//! The update channel baked into every build.
//!
//! yapmod has a single channel. The value is still written into signed
//! manifests and bundles as `stable` so installations built before the nightly
//! channel was removed keep validating the feed and reading the same paths.

/// The only update channel. It is part of the build, not a user setting.
pub const UPDATE_CHANNEL: &str = "stable";

#[cfg(test)]
mod tests {
    use super::UPDATE_CHANNEL;

    #[test]
    fn the_only_channel_keeps_the_signed_name() {
        assert_eq!(UPDATE_CHANNEL, "stable");
    }
}
