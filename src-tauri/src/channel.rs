use semver::Version;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// The update channel an installation belongs to.
///
/// The channel is part of the build, not a user setting. A stable package is
/// compiled with `YAPMOD_UPDATE_CHANNEL=stable`, and a nightly package with
/// `YAPMOD_UPDATE_CHANNEL=nightly`. Builds made before the channel existed
/// fall back to their version metadata so an already installed nightly keeps
/// receiving nightlies instead of silently moving to stable.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export, export_to = "types.ts")]
pub enum UpdateChannel {
    #[default]
    Stable,
    Nightly,
}

impl UpdateChannel {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Stable => "stable",
            Self::Nightly => "nightly",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value.trim() {
            "stable" => Some(Self::Stable),
            "nightly" => Some(Self::Nightly),
            _ => None,
        }
    }

    /// Resolves a channel from explicit build configuration.
    ///
    /// `configured` is the value embedded at compile time. Invalid values are
    /// reported and fall back to the legacy version check rather than risking
    /// an accidental channel switch.
    pub fn resolve(configured: Option<&str>, app_version: &str) -> Self {
        match configured {
            Some(value) => match Self::parse(value) {
                Some(channel) => channel,
                None => {
                    eprintln!(
                        "ignoring invalid YAPMOD_UPDATE_CHANNEL value {value:?}; \
                         falling back to the version metadata"
                    );
                    Self::legacy_from_version(app_version)
                }
            },
            None => Self::legacy_from_version(app_version),
        }
    }

    /// The channel compiled into this binary.
    pub fn active() -> Self {
        Self::resolve(
            option_env!("YAPMOD_UPDATE_CHANNEL"),
            env!("CARGO_PKG_VERSION"),
        )
    }

    /// Recognizes nightly builds created before the channel was explicit.
    fn legacy_from_version(app_version: &str) -> Self {
        let is_nightly = Version::parse(app_version)
            .ok()
            .and_then(|version| version.build.as_str().split('.').next().map(str::to_owned))
            .is_some_and(|prefix| prefix == "nightly");

        if is_nightly {
            Self::Nightly
        } else {
            Self::Stable
        }
    }

    /// The directory used for this channel's cached update state.
    pub const fn directory(self) -> &'static str {
        self.as_str()
    }
}

#[cfg(test)]
mod tests {
    use super::UpdateChannel;

    #[test]
    fn parses_only_known_channels() {
        assert_eq!(UpdateChannel::parse("stable"), Some(UpdateChannel::Stable));
        assert_eq!(
            UpdateChannel::parse(" nightly "),
            Some(UpdateChannel::Nightly)
        );
        assert_eq!(UpdateChannel::parse("Nightly"), None);
        assert_eq!(UpdateChannel::parse("beta"), None);
    }

    #[test]
    fn explicit_build_configuration_wins_over_version_metadata() {
        assert_eq!(
            UpdateChannel::resolve(Some("nightly"), "0.5.0"),
            UpdateChannel::Nightly
        );
        assert_eq!(
            UpdateChannel::resolve(Some("stable"), "0.5.0+nightly.20261027.1"),
            UpdateChannel::Stable
        );
    }

    #[test]
    fn legacy_nightlies_keep_their_channel() {
        assert_eq!(
            UpdateChannel::resolve(None, "0.5.1+nightly.20261027.12"),
            UpdateChannel::Nightly
        );
        assert_eq!(UpdateChannel::resolve(None, "0.5.1"), UpdateChannel::Stable);
        assert_eq!(
            UpdateChannel::resolve(None, "0.5.1-rc.1"),
            UpdateChannel::Stable
        );
    }

    #[test]
    fn invalid_build_configuration_falls_back_safely() {
        assert_eq!(
            UpdateChannel::resolve(Some("beta"), "0.5.1+nightly.20261027.12"),
            UpdateChannel::Nightly
        );
        assert_eq!(
            UpdateChannel::resolve(Some(""), "0.5.1"),
            UpdateChannel::Stable
        );
    }
}
