# Yapmod Security

## Content Security Policy (CSP)

### Why CSP is Disabled

Yapmod does not set a Content Security Policy header (`"csp": null` in `tauri.conf.json`).
This is a deliberate decision, documented here with its justification and the compensating
controls that mitigate the associated risks.

#### The App Architecture Prevents Standard CSP

Yapmod is a Tauri shell around the live Yapin website (`https://www.yapin.gg/`). The
webview loads a remote HTTPS origin, not local HTML files. Tauri's built-in CSP mechanism
works by injecting CSP directives into local HTML responses served by the Tauri dev server
or the `asset://` protocol. Because the webview navigates to an external origin, Tauri's
CSP header injection has no effect — the remote page controls its own headers.

Even if a CSP header could be set on the webview, the injection model would conflict with
it:

- **Preinject script** — delivered via `initialization_script()`, which injects an inline
  `<script>` block at document start. A strict `script-src` directive would block it
  unless `'unsafe-inline'` or a hash/nonce was used.
- **Postinject script** — delivered via `webview.eval()` after page load. This is
  equivalent to `eval()` and would require `'unsafe-eval'` in `script-src`.
- **Plugin scripts** — loaded as ES modules over `blob:` URLs
  (`URL.createObjectURL(new Blob(...))`). A strict CSP would need to allow `blob:` in
  `script-src`, which defeats the purpose of restricting script sources.
- **Theme stylesheets** — injected as inline `<style>` elements with `textContent`. A
  strict `style-src` would need `'unsafe-inline'`.

Setting a permissive CSP that allows all of these (`'unsafe-inline'`, `'unsafe-eval'`,
`blob:`) would provide no meaningful security benefit over leaving it disabled.

#### Compensating Controls

Instead of a CSP header that cannot be enforced meaningfully, Yapmod relies on the
following layered compensating controls:

##### 1. Strict Origin Validation Before Injection

Both the preinject and postinject scripts guard every injection against an allowlist of
exact origins. The scripts refuse to run unless `location.origin` matches one of the two
approved values:

```
https://yapin.gg
https://www.yapin.gg
```

The check is performed in both Rust (`src-tauri/src/hosts.rs`) and JavaScript
(`src-tauri/src/injection/preinject.rs`, `src-tauri/src/injection/postinject.rs`).
Subdomains (e.g., `chat.yapin.gg`) are explicitly excluded from injection.

Additionally, `window.top === window` is checked to prevent injection inside iframes.

##### 2. Strict Origin Validation for Permissions

Microphone and camera permission requests are granted only when the webview URL matches
an approved Yapin origin. Any navigation to an unapproved origin automatically denies
these permissions.

##### 3. Plugin Validation

All plugin packages are validated before execution:

- **Size limits** — manifest, CSS, and script files are bounded by configurable maximums
  (`community-plugins/rules.json`). Oversize files are rejected at read time.
- **Symlink rejection** — `fs::symlink_metadata()` is used to reject symbolic links,
  preventing symlink-based path traversal.
- **Path traversal protection** — plugin IDs are validated against a strict regex
  (`^[a-z0-9][a-z0-9_-]{0,24}$`). Dots, slashes, and `..` sequences are rejected.
- **Manifest validation** — unknown fields are rejected (`deny_unknown_fields`), API
  version is checked, and setting types are validated.
- **Consent flow** — before a plugin runs for the first time (or after its content
  changes), the user must explicitly consent. Consent is bound to a SHA-256 hash of the
  plugin's CSS and script content, so a modified plugin requires fresh consent.
- **Community catalog verification** — community plugins are installed from a reviewed
  static catalog. Verified packages are marked by a server-side `.yapmod-verified` file
  that plugin authors cannot self-declare.
- **Sandboxed storage keys** — plugin storage keys are validated against a strict regex
  and namespaced under the plugin's ID.

##### 4. Theme Validation

All theme packages are validated before application:

- **Size limits** — manifest and CSS files are bounded by configurable maximums
  (`community-themes/rules.json`).
- **Symlink rejection** — symbolic links inside theme folders are rejected during install.
- **Path traversal protection** — theme IDs are validated against a strict regex.
- **Blocked CSS patterns** — dangerous CSS features (e.g., `behavior`, `-ms-filter`) are
  filtered during theme installation.
- **Community catalog verification** — community themes are installed from a reviewed
  static catalog with manifest integrity checks.

##### 5. Client Update Integrity

Client bundles (preinject + postinject scripts) are independently versioned:

- **Signed updates** — each client bundle is cryptographically signed. The app verifies
  the signature before applying an update.
- **Minimum app version** — a client bundle declares the minimum app version it requires,
  preventing incompatible updates.

##### 6. External Link Handling

Links that navigate outside the Yapin domain are opened in the system browser via
`tauri_plugin_opener`, not in the webview. The webview's `on_new_window` handler denies
any non-internal URL, preventing the webview from loading arbitrary external pages.

### Summary

CSP is disabled because the app's architecture (remote page loading with inline script
injection and blob URL module loading) makes a meaningful CSP header impossible to
configure. The compensating controls above provide equivalent or stronger protection by
enforcing origin validation at the injection boundary, validating all user-supplied code
before execution, and requiring explicit user consent for untrusted plugins.
