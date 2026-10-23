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

/// Compares semantic versions, with a numeric fallback for legacy strings.
pub fn compare_versions(left: &str, right: &str) -> Ordering {
    let left_semver = Version::parse(left.trim().trim_start_matches('v'));
    let right_semver = Version::parse(right.trim().trim_start_matches('v'));

    if let (Ok(left), Ok(right)) = (&left_semver, &right_semver) {
        return left.cmp_precedence(right);
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
