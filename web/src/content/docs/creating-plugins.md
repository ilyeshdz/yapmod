---
title: Creating a plugin
group: Plugins
order: 3
eyebrow: Plugins
description: The plugin package format and its developer API reference.
---

Create a folder containing `manifest.json`, `plugin.css`, and optionally `plugin.js`:

```text
my-plugin/
├── manifest.json
├── plugin.css
└── plugin.js       # optional
```

Use this minimal manifest:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "author": "Your name",
  "description": "What this plugin changes.",
  "api": 1,
  "stylesheet": "plugin.css",
  "script": "plugin.js"
}
```

Remove the `script` line when there is no `plugin.js`. `id`, `name`, and `api: 1` are required. IDs use letters, digits, `_`, and `-`, are at most 24 characters, and start with a letter or digit.

`plugin.css` is applied while the plugin is enabled. It cannot use `@import`, `url()`, CSS escapes, or external resources.

When present, `plugin.js` must return an object with `activate(api)`:

```js
return {
  activate(api) {
    document.documentElement.dataset.myPlugin = "enabled";
    api.log.info("activated");

    return () => {
      delete document.documentElement.dataset.myPlugin;
    };
  },
};
```

`activate` and its cleanup may be asynchronous.

## API reference

Every plugin receives an `api` object scoped to its own manifest:

| Member | Description |
| --- | --- |
| `api.apiVersion` | The plugin API version (`1`). Use it to feature-detect. |
| `api.id` | The plugin id from `manifest.json`. |
| `api.manifest` | A read-only copy of the manifest. |
| `api.storage` | Namespaced key/value storage. |
| `api.settings` | Manifest-declared settings. |
| `api.styles.add(css)` | Injects extra validated CSS and returns a cleanup function. |
| `api.log` | Console logger prefixed with the plugin id. |
| `api.onCleanup(fn)` | Registers cleanup that runs when the plugin is disabled. |
| `api.banner(message)` | Shows a dismissible banner. |
| `api.webSocket` | WebSocket inspector (see below). |
| `api.http` | HTTP inspector (see below). |

### Storage

Storage is namespaced by plugin id, so keys never collide with other plugins
or with yapmod settings. Keys use 1–24 letters, digits, `_`, or `-`.

```js
const launches = api.storage.get("launches", 0);
api.storage.set("launches", launches + 1);

api.storage.keys(); // string[]

const stop = api.storage.onChange("launches", (value) => {
  api.log.debug("launches changed", value);
});
stop();
```

### Settings

Declare user-facing options in the manifest's `settings` array. Yapmod shows
these controls in a settings modal on the plugin card; the user's changes are
applied when they choose **Save**.

```json
"settings": [
  {
    "id": "show-banner",
    "label": "Show banner",
    "description": "Display a status banner.",
    "type": "toggle",
    "default": true
  }
]
```

```js
api.settings.get("show-banner"); // boolean
api.settings.all();              // { "show-banner": true }
api.settings.onChange("show-banner", (value) => { /* ... */ });
```

Reading or subscribing to an undeclared setting throws, so typos fail loudly.

### Logging

```js
api.log.debug("state", state);
api.log.info("ready");
api.log.warn("fallback used");
api.log.error("request failed", error);
```

Messages are printed as `[plugin:<id>] ...`, which makes plugin output easy to
filter in the console.

### Cleanup

Returning a cleanup function from `activate` still works. For helpers created
during activation, `api.onCleanup` is often clearer and runs even when
`activate` throws after registering them:

```js
// inside activate(api)
const timer = setInterval(refresh, 5000);
api.onCleanup(() => clearInterval(timer));

const stop = api.settings.onChange("show-banner", refresh);
api.onCleanup(stop);
```

Callbacks run in reverse registration order when the plugin is disabled, then
the cleanup returned by `activate` runs. Every listener, timer, node, and DOM
change created by the plugin must be released.

## Inspectors

The inspectors are passive observers: they never change observed traffic.
`messages()` returns a snapshot of the most recent entries (up to 5000).

```js
// HTTP: complete request/response pairs, or requests as they are sent.
const stopExchanges = api.http.exchanges.subscribe((exchange) => {
  api.log.debug(exchange.method, exchange.url, exchange.status);
});
const stopOutgoing = api.http.outgoing.subscribe((request) => {
  api.log.debug("sending", request.method, request.url);
});

// WebSocket: incoming and outgoing messages.
const stopIncoming = api.webSocket.incoming.subscribe((message) => {
  api.log.debug("received", message.url, message.data);
});
const stopOutgoingWs = api.webSocket.outgoing.subscribe((message) => {
  api.log.debug("sent", message.url, message.data);
});
```

Outgoing WebSocket messages can be modified with an interceptor. Return the
replacement payload, or `undefined` to leave it unchanged:

```js
const removeInterceptor = api.webSocket.outgoing.use((message) => {
  if (typeof message.data === "string" && message.data.includes("spam")) {
    return ""; // replace the payload
  }
  return undefined; // keep it unchanged
});
```

HTTP responses can be intercepted and modified before they reach the caller.
Return a new `Response` object to replace the original, or `undefined` to
leave it unchanged:

```js
const removeInterceptor = api.http.responses.use((exchange) => {
  if (exchange.url.includes("/rest/v1/messages") && exchange.status === 200) {
    const modified = JSON.parse(exchange.responseBody);
    modified.push({ id: "ghost-1", content: "deleted message" });
    return new Response(JSON.stringify(modified), {
      status: exchange.status,
      headers: Object.fromEntries(exchange.responseHeaders),
    });
  }
  return undefined; // keep the original response
});
```

Bodies are immutable snapshots; binary payloads are copied, and `Blob` bodies
appear as `{ __blob: true, type, size }`.

> [!WARNING]
> JavaScript plugins are trusted page code, not sandboxed extensions. They run
> in the Yapper page with full access to its DOM and JavaScript realm. Test
> locally with **Settings → Yapmod → Plugins → Import plugin** and only
> distribute code you expect users to trust.
