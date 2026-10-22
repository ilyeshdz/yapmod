# Injected client releases

The desktop app version is maintained in `src-tauri/Cargo.toml`; Tauri uses
that version when no version is set in `tauri.conf.json`. The client version is
independent and maintained in `client/version.json`. Bump only the version for
the component being released.

The app accepts injected-client updates only when the signed manifest verifies
against the public key embedded at build time. The updater is disabled when
`YAPMOD_CLIENT_UPDATE_PUBLIC_KEY` is empty, so configure the key before
building the first app release that should receive independent client updates.

Create an Ed25519 signing key offline:

```sh
openssl genpkey -algorithm Ed25519 -out client-update-key.pem
openssl pkey -in client-update-key.pem -pubout -outform DER \
  | tail -c 32 | base64 | tr -d '\n'
```

Keep `client-update-key.pem` private and out of the repository. Add its PEM
contents as the Actions secret `CLIENT_UPDATE_SIGNING_KEY`, and the base64
public-key output as the repository Actions variable
`CLIENT_UPDATE_PUBLIC_KEY`. The normal build workflow embeds that public key
in the native app. Existing installations need a desktop-app release built
with the key before they can accept injected-client releases.

After the key is configured and the app build with the pinned public key is
available, update `client/version.json` when the client code changes, then run
**Publish injected client** from `main`. The workflow reads the client version
from that file. Use a strictly increasing release sequence, a semantic minimum
app version, and a future Unix-seconds expiry no more than 90 days ahead. The
workflow signs the manifest and deploys the website and update feed together
to GitHub Pages. The fixed bridge API version is currently `1`; increase it in
the updater and publishing workflow only when the native bridge changes
incompatibly.
