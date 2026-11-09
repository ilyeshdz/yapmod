use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use ring::{digest, signature};
use semver::Version;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::error::YapmodError;
use crate::{channel::UPDATE_CHANNEL, http, injection::ClientBundle};

const UPDATES_BASE_URL: &str = "https://ilyeshdz.github.io/yapmod/client-updates";
const REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);
const MAX_MANIFEST_SIZE: usize = 16 * 1024;
const MAX_SIGNATURE_SIZE: usize = 1024;
const MAX_BUNDLE_SIZE: usize = 8 * 1024 * 1024;
const MAX_MANIFEST_LIFETIME: u64 = 90 * 24 * 60 * 60;
const BRIDGE_API_VERSION: u32 = 1;
const CLIENT_UPDATE_PUBLIC_KEY: Option<&str> = option_env!("YAPMOD_CLIENT_UPDATE_PUBLIC_KEY");

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    client_version: String,
    release_sequence: u64,
    bridge_api_version: u32,
    min_app_version: String,
    channel: String,
    expires_at: u64,
    bundle_sha256: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct State {
    highest_sequence: u64,
    last_good_sequence: Option<u64>,
    pending_sequence: Option<u64>,
    trial_started: bool,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientUpdateLaunchStatus {
    pub trial: bool,
    pub rolled_back: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientUpdateInfo {
    pub current_version: String,
    pub latest_version: String,
}

pub struct LaunchSelection {
    pub bundle: Option<ClientBundle>,
    pub status: ClientUpdateLaunchStatus,
}

fn updates_dir(app: &AppHandle) -> Result<PathBuf, YapmodError> {
    let base = app
        .path()
        .app_config_dir()
        .map(|path| path.join("client-updates"))
        .map_err(|e| YapmodError::io(e.to_string()))?;
    let dir = base.join(UPDATE_CHANNEL);

    migrate_legacy_stable_state(&base, &dir);

    Ok(dir)
}

/// Stable installations used the update directory before channels existed.
/// Keep their high-water mark so a replayed release cannot be installed again,
/// but do not carry over unsigned cached artifacts into the new channel.
fn migrate_legacy_stable_state(base: &Path, dir: &Path) {
    if state_path(dir).exists() {
        return;
    }

    let Ok(bytes) = fs::read(state_path(base)) else {
        return;
    };
    let Ok(legacy) = serde_json::from_slice::<State>(&bytes) else {
        return;
    };
    if legacy.highest_sequence == 0 {
        return;
    }

    let migrated = State {
        highest_sequence: legacy.highest_sequence,
        ..State::default()
    };
    if fs::create_dir_all(dir).is_ok()
        && let Ok(bytes) = serde_json::to_vec(&migrated)
    {
        let _ = write_atomic(&state_path(dir), &bytes);
    }
}

fn update_url(file: &str) -> String {
    format!("{UPDATES_BASE_URL}/{UPDATE_CHANNEL}/{file}")
}

fn state_path(dir: &Path) -> PathBuf {
    dir.join("state.json")
}

fn bundle_path(dir: &Path, sequence: u64) -> PathBuf {
    dir.join(format!("bundle-{sequence}.json"))
}

fn manifest_path(dir: &Path, sequence: u64) -> PathBuf {
    dir.join(format!("manifest-{sequence}.json"))
}

fn signature_path(dir: &Path, sequence: u64) -> PathBuf {
    dir.join(format!("signature-{sequence}.bin"))
}

fn remove_cached_bundle(dir: &Path, sequence: u64) {
    let _ = fs::remove_file(bundle_path(dir, sequence));
    let _ = fs::remove_file(manifest_path(dir, sequence));
    let _ = fs::remove_file(signature_path(dir, sequence));
}

fn pinned_public_key() -> Option<Vec<u8>> {
    let encoded = CLIENT_UPDATE_PUBLIC_KEY.filter(|key| !key.trim().is_empty())?;
    let key = STANDARD.decode(encoded.trim()).ok()?;
    (key.len() == 32).then_some(key)
}

fn read_state(dir: &Path) -> State {
    let path = state_path(dir);
    let backup = path.with_extension("old");
    let parse = |path: &Path| {
        fs::read(path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<State>(&bytes).ok())
    };

    if let Some(state) = parse(&path) {
        return state;
    }

    if let Some(state) = parse(&backup) {
        if let Ok(bytes) = serde_json::to_vec(&state) {
            let _ = fs::write(path, bytes);
        }
        return state;
    }

    State::default()
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), YapmodError> {
    let temporary = path.with_extension(format!("{}.tmp", std::process::id()));
    fs::write(&temporary, bytes).map_err(|e| YapmodError::io(e.to_string()))?;

    // State and bundles are replaced only after a complete temporary file is
    // present. Windows does not replace an existing destination on rename.
    if path.exists() {
        let backup = path.with_extension("old");
        let _ = fs::remove_file(&backup);
        fs::rename(path, &backup).map_err(|e| YapmodError::io(e.to_string()))?;
        if let Err(error) = fs::rename(&temporary, path) {
            let _ = fs::rename(&backup, path);
            let _ = fs::remove_file(&temporary);
            return Err(YapmodError::io(error.to_string()));
        }
        let _ = fs::remove_file(backup);
    } else {
        fs::rename(&temporary, path).map_err(|e| YapmodError::io(e.to_string()))?;
    }

    Ok(())
}

fn write_state(dir: &Path, state: &State) -> Result<(), YapmodError> {
    let bytes = serde_json::to_vec(state).map_err(|error| YapmodError::io(error.to_string()))?;
    write_atomic(&state_path(dir), &bytes)
}

fn read_bundle(dir: &Path, sequence: u64, app_version: &str) -> Option<ClientBundle> {
    let key = pinned_public_key()?;
    let bytes = fs::read(bundle_path(dir, sequence)).ok()?;
    let manifest_bytes = fs::read(manifest_path(dir, sequence)).ok()?;
    let signature_bytes = fs::read(signature_path(dir, sequence)).ok()?;
    verified_bundle(&manifest_bytes, &signature_bytes, &bytes, &key, app_version)
        .filter(|bundle| bundle.release_sequence == sequence)
}

fn compatible(bundle: &ClientBundle, app_version: &str) -> bool {
    if bundle.channel != UPDATE_CHANNEL
        || bundle.client_version.is_empty()
        || bundle.client_version.len() > 64
        || bundle.bridge_api_version != BRIDGE_API_VERSION
        || bundle.preinject.is_empty()
        || bundle.postinject.is_empty()
        || bundle.minimum_css.is_empty()
    {
        return false;
    }

    match (
        Version::parse(&bundle.min_app_version),
        Version::parse(app_version),
    ) {
        (Ok(minimum), Ok(current)) => current >= minimum,
        _ => false,
    }
}

fn validate_manifest(
    manifest: &Manifest,
    highest_sequence: u64,
    app_version: &str,
    now: u64,
) -> Result<(), YapmodError> {
    if manifest.channel != UPDATE_CHANNEL {
        return Err(YapmodError::validation(
            "the client update belongs to another channel",
        ));
    }
    if manifest.client_version.is_empty() || manifest.client_version.len() > 64 {
        return Err(YapmodError::validation(
            "the client update version is invalid",
        ));
    }
    if Version::parse(&manifest.client_version).is_err() {
        return Err(YapmodError::validation(
            "the client update version is not a semantic version",
        ));
    }
    if manifest.expires_at <= now {
        return Err(YapmodError::validation(
            "the client update manifest has expired",
        ));
    }
    if manifest.expires_at.saturating_sub(now) > MAX_MANIFEST_LIFETIME {
        return Err(YapmodError::validation(
            "the client update manifest expiry is too far in the future",
        ));
    }
    if manifest.release_sequence <= highest_sequence {
        return Err(YapmodError::validation(
            "the client update manifest is stale",
        ));
    }

    let minimum_app = Version::parse(&manifest.min_app_version)
        .map_err(|_| YapmodError::validation("the client update minimum app version is invalid"))?;
    let current_app = Version::parse(app_version)
        .map_err(|_| YapmodError::validation("the installed app version is invalid"))?;
    if current_app < minimum_app || manifest.bridge_api_version != BRIDGE_API_VERSION {
        return Err(YapmodError::validation(
            "the client update is incompatible with this app",
        ));
    }
    if hex_digest(&manifest.bundle_sha256).is_none() {
        return Err(YapmodError::validation("the client update hash is invalid"));
    }

    Ok(())
}

fn bundle_matches_manifest(bundle: &ClientBundle, manifest: &Manifest, app_version: &str) -> bool {
    bundle.channel == UPDATE_CHANNEL
        && bundle.client_version == manifest.client_version
        && bundle.release_sequence == manifest.release_sequence
        && bundle.bridge_api_version == manifest.bridge_api_version
        && bundle.min_app_version == manifest.min_app_version
        && compatible(bundle, app_version)
}

fn verified_bundle(
    manifest_bytes: &[u8],
    signature_bytes: &[u8],
    bundle_bytes: &[u8],
    public_key: &[u8],
    app_version: &str,
) -> Option<ClientBundle> {
    if !verify_manifest(manifest_bytes, signature_bytes, public_key) {
        return None;
    }
    let manifest: Manifest = serde_json::from_slice(manifest_bytes).ok()?;
    if manifest.channel != UPDATE_CHANNEL {
        return None;
    }
    let expected_hash = hex_digest(&manifest.bundle_sha256)?;
    if digest::digest(&digest::SHA256, bundle_bytes).as_ref() != expected_hash.as_slice() {
        return None;
    }
    let bundle: ClientBundle = serde_json::from_slice(bundle_bytes).ok()?;
    bundle_matches_manifest(&bundle, &manifest, app_version).then_some(bundle)
}

/// Selects a cached last-known-good bundle or marks a pending bundle as the
/// one-launch trial. A still-pending trial on the next launch is rolled back.
pub fn for_launch(app: &AppHandle, app_version: &str) -> LaunchSelection {
    let fallback = || LaunchSelection {
        bundle: None,
        status: ClientUpdateLaunchStatus::default(),
    };

    let Ok(dir) = updates_dir(app) else {
        return fallback();
    };
    if fs::create_dir_all(&dir).is_err() {
        return fallback();
    }
    let mut state = read_state(&dir);
    let mut status = ClientUpdateLaunchStatus::default();

    if let Some(sequence) = state.pending_sequence {
        if state.last_good_sequence == Some(sequence) {
            state.pending_sequence = None;
            state.trial_started = false;
            let _ = write_state(&dir, &state);
        } else if state.trial_started {
            // The previous launch never confirmed readiness. Keep the high
            // water mark so a replay of the same signed release is rejected.
            remove_cached_bundle(&dir, sequence);
            state.pending_sequence = None;
            state.trial_started = false;
            let _ = write_state(&dir, &state);
            status.rolled_back = true;
        } else if let Some(bundle) = read_bundle(&dir, sequence, app_version) {
            state.trial_started = true;
            if write_state(&dir, &state).is_ok() {
                status.trial = true;
                return LaunchSelection {
                    bundle: Some(bundle),
                    status,
                };
            }
        } else {
            remove_cached_bundle(&dir, sequence);
            state.pending_sequence = None;
            state.trial_started = false;
            let _ = write_state(&dir, &state);
            status.rolled_back = true;
        }
    }

    let bundle = state
        .last_good_sequence
        .and_then(|sequence| read_bundle(&dir, sequence, app_version));
    LaunchSelection { bundle, status }
}

#[tauri::command]
pub fn get_client_update_launch_status(
    status: tauri::State<'_, ClientUpdateLaunchStatus>,
) -> ClientUpdateLaunchStatus {
    status.inner().clone()
}

/// Called only after postinject has completed on an approved Yapin origin.
#[tauri::command]
pub fn confirm_client_update(app: AppHandle) -> Result<(), YapmodError> {
    let dir = updates_dir(&app)?;
    let mut state = read_state(&dir);

    let Some(sequence) = state.pending_sequence else {
        return Ok(());
    };

    if !state.trial_started {
        return Ok(());
    }

    // A bundle promoted without compatibility checks must never become the
    // fallback for a later app version.
    let app_version = app.package_info().version.to_string();
    if read_bundle(&dir, sequence, &app_version).is_none() {
        return Err(YapmodError::validation(
            "the trial client bundle is no longer compatible",
        ));
    }

    state.last_good_sequence = Some(sequence);
    state.pending_sequence = None;
    state.trial_started = false;
    write_state(&dir, &state)?;

    // Keep just the last-known-good bundle; orphaned interrupted downloads
    // are harmless and can be discarded after successful promotion.
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.file_name().is_some_and(|name| {
                let name = name.to_string_lossy();
                (name.starts_with("bundle-")
                    || name.starts_with("manifest-")
                    || name.starts_with("signature-"))
                    && path != bundle_path(&dir, sequence)
                    && path != manifest_path(&dir, sequence)
                    && path != signature_path(&dir, sequence)
            }) {
                let _ = fs::remove_file(path);
            }
        }
    }

    Ok(())
}

fn verify_manifest(bytes: &[u8], signature_bytes: &[u8], public_key: &[u8]) -> bool {
    signature::UnparsedPublicKey::new(&signature::ED25519, public_key)
        .verify(bytes, signature_bytes)
        .is_ok()
}

/// Checks the static feed and stores a compatible bundle for next launch. All
/// downloaded bytes are authenticated before they are persisted.
pub async fn check_for_client_update(
    app: AppHandle,
    app_version: String,
) -> Result<(), YapmodError> {
    let Some(encoded_key) = CLIENT_UPDATE_PUBLIC_KEY.filter(|key| !key.trim().is_empty()) else {
        return Ok(());
    };
    let public_key = STANDARD.decode(encoded_key.trim()).map_err(|_| {
        YapmodError::validation("the configured client update public key is invalid")
    })?;
    if public_key.len() != 32 {
        return Err(YapmodError::validation(
            "the configured client update public key is invalid",
        ));
    }

    let dir = updates_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| YapmodError::io(e.to_string()))?;
    let state = read_state(&dir);
    if state.pending_sequence.is_some() {
        return Ok(());
    }

    // Fetch manifest and signature in parallel to reduce wall-clock time.
    let manifest_url = update_url("manifest.json");
    let sig_url = update_url("manifest.sig");

    #[allow(clippy::type_complexity)]
    let (manifest_result, sig_result): (
        Result<Option<Vec<u8>>, String>,
        Result<Option<Vec<u8>>, String>,
    ) = tokio::join!(
        http::fetch(&manifest_url, MAX_MANIFEST_SIZE, REQUEST_TIMEOUT),
        http::fetch(&sig_url, MAX_SIGNATURE_SIZE, REQUEST_TIMEOUT),
    );

    // A missing feed simply means that there is no published client update
    // yet. Other failures remain visible to the caller.
    let manifest_bytes = match manifest_result? {
        Some(bytes) => bytes,
        None => return Ok(()),
    };
    let signature_bytes = STANDARD
        .decode(sig_result?.ok_or_else(|| "the client update signature is missing".to_string())?)
        .map_err(|_| "the client update signature is not valid base64".to_string())?;
    if !verify_manifest(&manifest_bytes, &signature_bytes, &public_key) {
        return Err(YapmodError::validation(
            "the client update manifest signature is invalid",
        ));
    }

    let manifest: Manifest = serde_json::from_slice(&manifest_bytes).map_err(|error| {
        YapmodError::validation(format!("the client update manifest is invalid: {error}"))
    })?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| YapmodError::io(error.to_string()))?
        .as_secs();
    validate_manifest(&manifest, state.highest_sequence, &app_version, now)?;

    let bundle_bytes = http::fetch(&update_url("bundle.json"), MAX_BUNDLE_SIZE, REQUEST_TIMEOUT)
        .await
        .map_err(YapmodError::network)?
        .ok_or_else(|| YapmodError::not_found("the client update bundle is missing"))?;
    if verified_bundle(
        &manifest_bytes,
        &signature_bytes,
        &bundle_bytes,
        &public_key,
        &app_version,
    )
    .is_none()
    {
        return Err(YapmodError::validation(
            "the client update bundle failed verification",
        ));
    }

    let bundle_path = bundle_path(&dir, manifest.release_sequence);
    for (path, bytes) in [
        (bundle_path.clone(), &bundle_bytes[..]),
        (
            manifest_path(&dir, manifest.release_sequence),
            &manifest_bytes[..],
        ),
        (
            signature_path(&dir, manifest.release_sequence),
            &signature_bytes[..],
        ),
    ] {
        if let Err(error) = write_atomic(&path, bytes) {
            remove_cached_bundle(&dir, manifest.release_sequence);
            return Err(error);
        }
    }

    let mut state = state;
    state.highest_sequence = manifest.release_sequence;
    state.pending_sequence = Some(manifest.release_sequence);
    state.trial_started = false;
    if let Err(error) = write_state(&dir, &state) {
        remove_cached_bundle(&dir, manifest.release_sequence);
        return Err(error);
    }

    Ok(())
}

/// Downloads and stages the newest compatible client bundle for the next
/// process launch, then returns its display versions to the injected UI.
#[tauri::command]
pub async fn prepare_client_update(
    app: AppHandle,
    current_client_version: String,
) -> Result<Option<ClientUpdateInfo>, YapmodError> {
    #[cfg(debug_assertions)]
    if std::env::var_os("YAPMOD_TEST_CLIENT_UPDATE").is_some() {
        return Ok(Some(ClientUpdateInfo {
            current_version: current_client_version,
            latest_version: "local-test".to_string(),
        }));
    }

    let app_version = app.package_info().version.to_string();

    check_for_client_update(app.clone(), app_version.clone()).await?;

    let dir = updates_dir(&app)?;
    let state = read_state(&dir);
    let Some(sequence) = state.pending_sequence else {
        return Ok(None);
    };
    let bundle = read_bundle(&dir, sequence, &app_version)
        .ok_or_else(|| YapmodError::validation("the staged client update could not be verified"))?;

    Ok(Some(ClientUpdateInfo {
        current_version: current_client_version,
        latest_version: bundle.client_version,
    }))
}

fn hex_digest(value: &str) -> Option<Vec<u8>> {
    if value.len() != 64 {
        return None;
    }
    (0..64)
        .step_by(2)
        .map(|index| u8::from_str_radix(&value[index..index + 2], 16).ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use ring::signature::KeyPair;

    fn bundle(channel: &str) -> ClientBundle {
        ClientBundle {
            client_version: "1.0.0".to_string(),
            release_sequence: 2,
            bridge_api_version: BRIDGE_API_VERSION,
            min_app_version: "0.4.0".to_string(),
            channel: channel.to_string(),
            preinject: "pre".to_string(),
            postinject: "post".to_string(),
            minimum_css: "css".to_string(),
        }
    }

    fn signed_manifest(
        bundle: &ClientBundle,
        pair: &signature::Ed25519KeyPair,
    ) -> (Vec<u8>, Vec<u8>) {
        let bundle_bytes = serde_json::to_vec(bundle).unwrap();
        let manifest_bytes = serde_json::to_vec(&Manifest {
            client_version: bundle.client_version.clone(),
            release_sequence: bundle.release_sequence,
            bridge_api_version: bundle.bridge_api_version,
            min_app_version: bundle.min_app_version.clone(),
            channel: bundle.channel.clone(),
            expires_at: 100,
            bundle_sha256: digest::digest(&digest::SHA256, &bundle_bytes)
                .as_ref()
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect(),
        })
        .unwrap();
        let signed = pair.sign(&manifest_bytes).as_ref().to_vec();

        (manifest_bytes, signed)
    }

    #[test]
    fn verifies_only_signed_manifest_bytes() {
        let seed = [7u8; 32];
        let pair = signature::Ed25519KeyPair::from_seed_unchecked(&seed).unwrap();
        let message = br#"{"releaseSequence":3}"#;
        let signature = pair.sign(message);
        assert!(verify_manifest(
            message,
            signature.as_ref(),
            pair.public_key().as_ref()
        ));
        assert!(!verify_manifest(
            br#"{"releaseSequence":4}"#,
            signature.as_ref(),
            pair.public_key().as_ref()
        ));
    }

    #[test]
    fn cached_bundle_requires_the_original_signed_manifest_and_hash() {
        let seed = [9u8; 32];
        let pair = signature::Ed25519KeyPair::from_seed_unchecked(&seed).unwrap();
        let bundle = bundle(UPDATE_CHANNEL);
        let bundle_bytes = serde_json::to_vec(&bundle).unwrap();
        let (manifest_bytes, signed) = signed_manifest(&bundle, &pair);

        assert!(
            verified_bundle(
                &manifest_bytes,
                &signed,
                &bundle_bytes,
                pair.public_key().as_ref(),
                "0.4.1",
            )
            .is_some()
        );

        let mut changed_bundle = bundle_bytes.clone();
        changed_bundle.push(b' ');
        assert!(
            verified_bundle(
                &manifest_bytes,
                &signed,
                &changed_bundle,
                pair.public_key().as_ref(),
                "0.4.1",
            )
            .is_none()
        );
    }

    #[test]
    fn a_bundle_from_another_channel_is_rejected() {
        let seed = [11u8; 32];
        let pair = signature::Ed25519KeyPair::from_seed_unchecked(&seed).unwrap();
        let bundle = bundle("nightly");
        let bundle_bytes = serde_json::to_vec(&bundle).unwrap();
        let (manifest_bytes, signed) = signed_manifest(&bundle, &pair);

        assert!(
            verified_bundle(
                &manifest_bytes,
                &signed,
                &bundle_bytes,
                pair.public_key().as_ref(),
                "0.4.1",
            )
            .is_none()
        );
    }

    #[test]
    fn rejects_unsupported_bridge_and_newer_minimum_app_versions() {
        let mut bundle = bundle(UPDATE_CHANNEL);
        assert!(compatible(&bundle, "0.4.1"));
        bundle.min_app_version = "0.5.0".to_string();
        assert!(!compatible(&bundle, "0.4.1"));
        bundle.min_app_version = "0.1.0".to_string();
        bundle.bridge_api_version += 1;
        assert!(!compatible(&bundle, "0.4.1"));
        bundle.bridge_api_version = BRIDGE_API_VERSION;
        bundle.channel = "nightly".to_string();
        assert!(!compatible(&bundle, "0.4.1"));
    }

    #[test]
    fn rejects_malformed_hashes() {
        assert_eq!(hex_digest(&"ab".repeat(32)).unwrap().len(), 32);
        assert!(hex_digest("nope").is_none());
    }

    #[test]
    fn rejects_expired_replayed_incompatible_and_foreign_manifests() {
        let manifest = Manifest {
            client_version: "1.0.0".to_string(),
            release_sequence: 7,
            bridge_api_version: BRIDGE_API_VERSION,
            min_app_version: "0.4.0".to_string(),
            channel: UPDATE_CHANNEL.to_string(),
            expires_at: 100,
            bundle_sha256: "ab".repeat(32),
        };
        assert!(validate_manifest(&manifest, 6, "0.4.1", 99).is_ok());
        assert!(validate_manifest(&manifest, 7, "0.4.1", 99).is_err());
        assert!(validate_manifest(&manifest, 6, "0.4.1", 100).is_err());
        assert!(validate_manifest(&manifest, 6, "0.3.9", 99).is_err());
        let mut foreign = manifest.clone();
        foreign.channel = "nightly".to_string();
        assert!(validate_manifest(&foreign, 6, "0.4.1", 99).is_err());
        let mut too_far_ahead = manifest;
        too_far_ahead.expires_at = MAX_MANIFEST_LIFETIME + 1;
        assert!(validate_manifest(&too_far_ahead, 6, "0.4.1", 0).is_err());
    }

    #[test]
    fn migrates_the_legacy_stable_high_water_mark_without_cached_bundles() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base = std::env::temp_dir().join(format!(
            "yapmod-client-update-migration-{}-{stamp}",
            std::process::id()
        ));
        let stable = base.join(UPDATE_CHANNEL);
        fs::create_dir_all(&base).unwrap();
        fs::write(
            state_path(&base),
            serde_json::to_vec(&State {
                highest_sequence: 9,
                last_good_sequence: Some(8),
                pending_sequence: Some(9),
                trial_started: true,
            })
            .unwrap(),
        )
        .unwrap();

        migrate_legacy_stable_state(&base, &stable);

        let migrated = read_state(&stable);
        assert_eq!(migrated.highest_sequence, 9);
        assert_eq!(migrated.last_good_sequence, None);
        assert_eq!(migrated.pending_sequence, None);
        assert!(!migrated.trial_started);

        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn recovers_state_after_an_interrupted_replacement() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "yapmod-client-update-test-{}-{stamp}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).unwrap();
        let expected = State {
            highest_sequence: 4,
            last_good_sequence: Some(3),
            pending_sequence: Some(4),
            trial_started: false,
        };
        fs::write(
            state_path(&dir).with_extension("old"),
            serde_json::to_vec(&expected).unwrap(),
        )
        .unwrap();

        let recovered = read_state(&dir);
        assert_eq!(recovered.highest_sequence, expected.highest_sequence);
        assert_eq!(recovered.pending_sequence, expected.pending_sequence);

        fs::remove_dir_all(dir).unwrap();
    }
}
