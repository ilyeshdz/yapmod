---
title: Creating a plugin
group: Plugins
order: 3
eyebrow: Plugins
description: A practical guide to building, testing, and shipping a Yapmod plugin.
---

A plugin is a small folder that Yapmod loads into the Yapper page. A
stylesheet alone can restyle the interface; adding a script lets the plugin
react to the app, store settings, and inspect network traffic.

This guide builds up a plugin one piece at a time, then ends with a complete
example that watches live HTTP and WebSocket activity.

## Start with a package

Every plugin folder looks like this:

```text
my-plugin/
├── manifest.json
├── plugin.css
└── plugin.js       # optional
```

Start with the manifest and stylesheet:

```json
{
  "id": "quiet-scrollbars",
  "name": "Quiet Scrollbars",
  "version": "1.0.0",
  "author": "Your name",
  "description": "Thin, low-contrast scrollbars.",
  "api": 1,
  "stylesheet": "plugin.css"
}
```

The manifest is the identity of the package.

- `id` is required and must match the folder name. Use 1–24 letters, digits,
  `_`, or `-`, starting with a letter or digit.
- `name` is required and is shown in the plugin list.
- `api` is required. The current plugin API version is `1`.
- `version`, `author`, `description`, and `license` are optional metadata.
- `tags` are optional search words used by the Community gallery.
- `settings` declares the simple toggles that appear on the plugin card.
- `stylesheet` must be `plugin.css` when present.
- `script` must be `plugin.js` when present.

Now write the stylesheet. It is ordinary CSS, but it cannot load external
resources: `@import`, `url()`, CSS escapes, and similar constructs are
rejected. A plugin with no script is a perfectly valid, useful plugin.

```css
/* plugin.css */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: color-mix(in srgb, var(--ym-text) 22%, transparent);
}
```

To try it, open **Settings → Yapmod → Plugins**, choose **Import plugin**, and
select the folder. Yapmod validates the package and shows a consent dialog
before enabling it.

## Add behavior with a script

Add `"script": "plugin.js"` to the manifest. Yapmod loads `plugin.js` as an ES
module and uses its default export, which must provide an `activate(api)`
function:

```js
export default {
  activate(api) {
    document.documentElement.dataset.quietScrollbars = "on";
    api.log.info("activated");

    return () => {
      delete document.documentElement.dataset.quietScrollbars;
    };
  },
};
```

`activate` may be asynchronous, and the cleanup function it returns may also be
asynchronous. Use the `api` argument rather than relying on globals; it is
scoped to your plugin.

`plugin.js` is a single-file module. Relative imports cannot be resolved
because the package is loaded from its source rather than from a folder on a
web server, so keep the plugin self-contained.

### Register cleanup as you go

A plugin can create many resources: timers, event listeners, subscriptions,
DOM nodes, and styles. Returning one large cleanup closure quickly becomes
fragile. `api.onCleanup` registers one callback per resource, in the order the
resource is created:

```js
export default {
  activate(api) {
    const timer = setInterval(refresh, 5000);
    api.onCleanup(() => clearInterval(timer));

    const stop = api.settings.onChange("show-badge", refresh);
    api.onCleanup(stop);
  },
};
```

Callbacks run in reverse order when the plugin is disabled. They also run when
`activate` throws after registering them, which prevents a broken activation
from leaving listeners behind. Returning a cleanup function still works, but
`api.onCleanup` is easier to reason about for plugins with several moving
parts.

Cleanup is not optional. A disabled plugin must not keep timers running,
listen for network events, or leave elements in the page.

## Use the plugin API

Every plugin receives the same `api` object, with identity, storage, settings,
styles, logging, and network inspectors. `api.apiVersion` lets you feature
detect newer APIs. `api.id` and `api.manifest` identify the running package.

### Logging

Use the namespaced logger instead of `console.log` directly:

```js
api.log.debug("state", state);
api.log.info("ready");
api.log.warn("fallback used");
api.log.error("request failed", error);
```

Messages are prefixed with `[plugin:<id>]`, which makes plugin output easy to
find in the browser console.

### Storage

Storage is namespaced by plugin id. Keys use the same 1–24 character format as
plugin ids, and values must be JSON-serializable. Writes are persisted in the
background.

```js
const launches = api.storage.get("launches", 0);
api.storage.set("launches", launches + 1);

api.storage.keys(); // string[]

const stop = api.storage.onChange("launches", (value) => {
  api.log.debug("launches changed", value);
});
api.onCleanup(stop);
```

Do not use storage as a message log. Store small summaries or preferences, not
copies of requests, headers, or message bodies.

### Settings

Settings are declared in the manifest, so users can change plugin behavior
without editing code. Yapmod renders them on the plugin card and saves them
when the user chooses **Save**.

```json
"settings": [
  {
    "id": "show-badge",
    "label": "Show activity badge",
    "description": "Display a small status badge.",
    "type": "toggle",
    "default": true
  }
]
```

Read settings through the API:

```js
api.settings.get("show-badge"); // boolean
api.settings.all();              // { "show-badge": true }

const stop = api.settings.onChange("show-badge", (value) => {
  badge.hidden = !value;
});
api.onCleanup(stop);
```

Reading or subscribing to an undeclared setting throws, so typos fail loudly.

### Styles

The package stylesheet is applied automatically. If a plugin needs to add CSS
at runtime, `api.styles.add` validates the CSS and returns a cleanup function:

```js
const removeStyle = api.styles.add(`
  .my-plugin-highlight {
    outline: 2px solid var(--ym-accent);
  }
`);
api.onCleanup(removeStyle);
```

### Banners, notifications, and modals

For short feedback, show a dismissible banner:

```js
api.banner("Network activity is being watched");
```

System notifications are useful for events that happen while the app is in the
background:

```js
const notification = api.notify.show({
  title: "Network activity",
  body: "A new request was observed.",
});
notification.close();
```

For anything that needs a real dialog, use the modal API. It returns a modal
handle with `close()` and `destroy()`:

```js
const modal = api.modal.show({
  title: "Network activity",
  description: "Live HTTP and WebSocket counters.",
  content: "Open the browser console for details.",
  buttons: [{ label: "Close", variant: "secondary" }],
});
```

## Watch network traffic

Yapmod installs its HTTP and WebSocket inspectors before the app starts. A
plugin can subscribe to live events and, where supported, modify traffic
before it is sent or delivered.

The most important rule is that **the inspectors keep no history**. A
subscriber receives each event once, as it happens. If you need a log, keep the
data in your plugin and release it during cleanup. This is deliberate: a plugin
should only retain what it actually needs.

### Observe HTTP

`api.http.outgoing` fires when a request is about to be sent.
`api.http.exchanges` fires after the response arrives and includes both sides
of the exchange.

```js
const stopOutgoing = api.http.outgoing.subscribe((request) => {
  api.log.debug("sending", request.method, request.url);
});

const stopExchanges = api.http.exchanges.subscribe((exchange) => {
  api.log.debug(
    "completed",
    exchange.method,
    exchange.url,
    `${exchange.status} ${exchange.statusText}`,
    `${exchange.duration}ms`,
  );
});

api.onCleanup(stopOutgoing);
api.onCleanup(stopExchanges);
```

An outgoing request has `url`, `method`, `requestHeaders`, `requestBody`, and
`timestamp`. An exchange adds `status`, `statusText`, `responseHeaders`,
`responseBody`, and `duration`. Header values are arrays of `[name, value]`
pairs.

### Modify HTTP requests

Register an interceptor on `api.http.outgoing`. An interceptor receives the
current request and may return a patch containing `url`, `method`, `headers`,
or `body`. Returning `undefined` leaves the request unchanged.

```js
const stop = api.http.outgoing.use(async (request) => {
  if (!request.url.includes("/rest/v1/messages")) {
    return undefined;
  }

  return {
    headers: [...request.requestHeaders, ["x-plugin-network", "on"]],
  };
});

api.onCleanup(stop);
```

A few rules matter here:

- Interceptors may be asynchronous and run in registration order.
- `headers` replaces the complete header set. Start from `request.requestHeaders`
  when you only want to add or change one header.
- `body` replaces the request body. Use `body: null` to send no body.
- If an interceptor throws or returns an invalid patch, the entire chain is
  discarded and the original request is sent.
- Interceptors affect every matching `fetch()` while they are registered. Remove
  them during cleanup.

### Modify HTTP responses

`api.http.responses.use` runs after the response arrives but before the caller
receives it. Return a new `Response` to replace the original, or `undefined` to
leave it alone. Response interceptors may also be asynchronous.

```js
const stop = api.http.responses.use((exchange) => {
  if (!exchange.url.includes("/rest/v1/messages") || exchange.status !== 200) {
    return undefined;
  }

  const messages = JSON.parse(exchange.responseBody);
  messages.push({ id: "example", content: "added by a plugin" });

  return new Response(JSON.stringify(messages), {
    status: exchange.status,
    headers: Object.fromEntries(exchange.responseHeaders),
  });
});

api.onCleanup(stop);
```

If any response interceptor fails, every modification in that chain is
discarded and the original response is delivered.

Response bodies are decoded for text, JSON, and XML content. Binary bodies are
copied into an `ArrayBuffer`. Blob bodies are represented as
`{ __blob: true, type, size }` because they cannot be read synchronously.
Streaming responses such as `text/event-stream` are delivered immediately and
report `responseBody` as `undefined`; buffering them would stop the stream from
working.

### Observe WebSocket messages

WebSocket messages are available in both directions:

```js
const stopIncoming = api.webSocket.incoming.subscribe((message) => {
  api.log.debug("received", message.url, message.data);
});

const stopOutgoing = api.webSocket.outgoing.subscribe((message) => {
  api.log.debug("sent", message.url, message.data);
});

api.onCleanup(stopIncoming);
api.onCleanup(stopOutgoing);
```

A message has `url`, `data`, and `timestamp`. Like HTTP bodies, binary data is
copied into an `ArrayBuffer`, and Blob data appears as `{ __blob: true, type,
size }`.

### Modify WebSocket messages

WebSocket interceptors run synchronously because the message is delivered
immediately. Return the replacement payload, or `undefined` to keep the current
one.

Incoming messages can be changed before application listeners see them:

```js
const stop = api.webSocket.incoming.use((message) => {
  if (typeof message.data === "string" && message.data.includes("secret")) {
    return "[redacted]";
  }
  return undefined;
});

api.onCleanup(stop);
```

Outgoing messages can be changed before `send()`:

```js
const stop = api.webSocket.outgoing.use((message) => {
  if (typeof message.data === "string" && message.data.includes("spam")) {
    return "";
  }
  return undefined;
});

api.onCleanup(stop);
```

An interceptor may return a string, `ArrayBuffer`, `ArrayBufferView`, or `Blob`.
If it throws or returns an invalid type, the whole chain is discarded and the
original payload is delivered. Incoming interceptors cannot be asynchronous;
message delivery is synchronous.

### Know the boundaries

The network inspectors are intentionally narrow:

- Only `fetch()` is inspected. XMLHttpRequest and other transports are not.
- There is no built-in message history, replay, or active-request list.
- Connection lifecycle events such as WebSocket open and close are not exposed.
- Incoming WebSocket interception is synchronous.
- Interceptors are global to the page while registered, so always remove them
  when the plugin is disabled.

## A complete example

The example below counts live HTTP and WebSocket activity without storing
messages. Its manifest declares three toggles:

```json
"settings": [
  {
    "id": "show-badge",
    "label": "Show activity badge",
    "description": "Display a small badge with live HTTP and WebSocket counts.",
    "type": "toggle",
    "default": true
  },
  {
    "id": "log-http",
    "label": "Log HTTP exchanges",
    "description": "Print completed HTTP exchanges to the browser console.",
    "type": "toggle",
    "default": false
  },
  {
    "id": "log-websocket",
    "label": "Log WebSocket messages",
    "description": "Print incoming and outgoing WebSocket messages to the browser console.",
    "type": "toggle",
    "default": false
  }
]
```

The module watches the inspectors as live streams, keeps only counters, and
cleans up every subscription and DOM node:

```js
export default {
  activate(api) {
    let sessionHttp = 0;
    let sessionWebSocket = 0;
    let badge = null;

    const render = () => {
      if (!api.settings.get("show-badge")) {
        badge?.remove();
        badge = null;
        return;
      }

      if (!badge) {
        badge = document.createElement("div");
        badge.id = "my-plugin-network-badge";
        badge.setAttribute("role", "status");
        document.body.append(badge);
      }

      badge.textContent =
        `HTTP ${sessionHttp} · WS ${sessionWebSocket}`;
    };

    api.onCleanup(api.http.exchanges.subscribe((exchange) => {
      sessionHttp += 1;
      if (api.settings.get("log-http")) {
        api.log.debug("HTTP", exchange.method, exchange.url, exchange.status);
      }
      render();
    }));

    api.onCleanup(api.webSocket.incoming.subscribe((message) => {
      sessionWebSocket += 1;
      if (api.settings.get("log-websocket")) {
        api.log.debug("WS in", message.url);
      }
      render();
    }));

    api.onCleanup(api.webSocket.outgoing.subscribe((message) => {
      sessionWebSocket += 1;
      if (api.settings.get("log-websocket")) {
        api.log.debug("WS out", message.url);
      }
      render();
    }));

    api.onCleanup(api.settings.onChange("show-badge", render));
    api.onCleanup(() => badge?.remove());

    render();
  },
};
```

Add the matching package stylesheet and manifest fields, install the folder
locally, and the plugin is complete. When it is disabled, `api.onCleanup`
removes the badge and unsubscribes from all three channels.

## Test and ship

The quickest test loop is a local import:

1. Create the plugin folder with a valid `manifest.json` and `plugin.css`.
2. Open **Settings → Yapmod → Plugins** and choose **Import plugin**.
3. Read the consent warning, enable the plugin, and inspect the browser console.
4. Change settings and confirm the plugin reacts without reloading.
5. Disable the plugin and check that its UI, timers, and listeners are gone.
6. Re-enable it and make sure it still behaves correctly.

Keep the package small and predictable. Stylesheets and scripts are limited to
512 KB each, a manifest can declare at most 12 settings, and every ID must use
the plugin key format. Yapmod hashes the package contents for consent, so
changing the CSS or JavaScript requires the user to approve the plugin again.

To publish a plugin in the Community catalog, add its folder under
`community-plugins/` with the same structure. The website build validates the
manifest, stylesheet, and script before publishing the package.

> [!WARNING]
> JavaScript plugins are trusted page code, not sandboxed extensions. They run
> in the Yapper page with full access to its DOM and JavaScript realm. Test
> locally and only distribute code you expect users to trust.
