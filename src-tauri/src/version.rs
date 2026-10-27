use semver::Version;
use std::cmp::Ordering;

/// Splits legacy version strings into numeric parts as a fallback.
fn parse_version(version: &str) -> Vec<u64> {
    version
        .trim()
        .trim_start_matches('v')
        .split(['.', '-', '+'])
        .map(|part| part.parse::<u64>().unwrap_or(0))
        .collect()
}

/// Extracts the `nightly.YYYYMMDD.RUN` build sequence, when present.
fn nightly_build(version: &Version) -> Option<Vec<u64>> {
    let build = version.build.as_str().strip_prefix("nightly.")?;

    build
        .split('.')
        .map(|part| part.parse::<u64>().ok())
        .collect::<Option<Vec<_>>>()
}

/// Compares semantic versions, with a numeric fallback for legacy strings.
pub fn compare_versions(left: &str, right: &str) -> Ordering {
    let left_semver = Version::parse(left.trim().trim_start_matches('v'));
    let right_semver = Version::parse(right.trim().trim_start_matches('v'));

    if let (Ok(left), Ok(right)) = (&left_semver, &right_semver) {
        let precedence = left.cmp_precedence(right);
        if precedence == Ordering::Equal {
            // Nightly versions use SemVer build metadata to stay compatible
            // with Linux package managers. Metadata is normally ignored by
            // SemVer precedence, so builds within the nightly channel are
            // ordered by their date and run number here. A stable release of
            // the same core version must still supersede that nightly.
            let left_nightly = nightly_build(left);
            let right_nightly = nightly_build(right);
            match (left_nightly, right_nightly) {
                (Some(left), Some(right)) => return left.cmp(&right),
                (None, Some(_)) if left.build.is_empty() => return Ordering::Greater,
                (Some(_), None) if right.build.is_empty() => return Ordering::Less,
                _ => {}
            }
        }
        return precedence;
    }

    let left = parse_version(left);
    let right = parse_version(right);

    for index in 0..left.len().max(right.len()) {
        let difference = left
            .get(index)
            .copied()
            .unwrap_or(0)
            .cmp(&right.get(index).copied().unwrap_or(0));

        if difference != Ordering::Equal {
            return difference;
        }
    }

    Ordering::Equal
}

/// Returns true when `candidate` is a newer version than `current`.
pub fn is_newer(candidate: &str, current: &str) -> bool {
    compare_versions(candidate, current) == Ordering::Greater
}

#[cfg(test)]
mod tests {
    use super::{compare_versions, is_newer};
    use std::cmp::Ordering;

    #[test]
    fn stable_release_supersedes_nightly_with_the_same_core_version() {
        assert_eq!(
            compare_versions("0.4.2", "0.4.2+nightly.20261023.12"),
            Ordering::Greater
        );
        assert!(is_newer("0.4.2", "0.4.2+nightly.20261023.12"));
        assert!(!is_newer("0.4.2+nightly.20261023.12", "0.4.2"));
    }

    #[test]
    fn stable_version_comparison_still_uses_semver_precedence() {
        assert!(is_newer("0.4.2", "0.4.1"));
        assert!(!is_newer("0.4.1", "0.4.2"));
    }

    #[test]
    fn nightly_builds_are_ordered_within_the_channel() {
        assert!(is_newer(
            "0.5.1+nightly.20261028.1",
            "0.5.1+nightly.20261027.12"
        ));
        assert!(is_newer(
            "0.5.1+nightly.20261027.13",
            "0.5.1+nightly.20261027.12"
        ));
        assert!(!is_newer(
            "0.5.1+nightly.20261027.12",
            "0.5.1+nightly.20261028.1"
        ));
        assert_eq!(
            compare_versions("0.5.1+nightly.20261027.12", "0.5.1+nightly.20261027.12"),
            Ordering::Equal
        );
    }

    #[test]
    fn stable_still_supersedes_a_nightly_with_the_same_core_version() {
        assert!(is_newer("0.5.1", "0.5.1+nightly.20261027.12"));
    }
}
