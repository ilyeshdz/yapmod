/**
 * Yaplay Bridge Plugin
 *
 * Connects to Yaplay's WebSocket server on a configurable port via the
 * native backend. When shareNotifications is enabled, forwards Yapin
 * notifications to Yaplay for overlay display.
 */

export default {
  activate(api) {
    const pluginId = api.id;

    async function connect() {
      const port = api.settings.get("websocket-port");

      if (!port) {
        api.log.warn("WebSocket port is not configured; skipping connection.");
        return;
      }

      try {
        await api.invoke("yaplay_connect", { pluginId, port: Number(port) });
      } catch (error) {
        api.log.error("Failed to connect to Yaplay:", error);
      }
    }

    async function disconnect() {
      try {
        await api.invoke("yaplay_disconnect", { pluginId });
      } catch (error) {
        api.log.error("Failed to disconnect from Yaplay:", error);
      }
    }

    function setShareNotifications(share) {
      api.invoke("yaplay_set_share_notifications", { pluginId, share }).catch((error) => {
        api.log.error("Failed to set shareNotifications:", error);
      });
    }

    // Listen for connection state changes from the backend
    function onStateChange(event) {
      if (event.detail.pluginId !== pluginId) return;
      const state = event.detail.state;

      switch (state) {
        case "connected":
          api.log.info("Connected to Yaplay WebSocket.");
          break;
        case "disconnected":
          api.log.info("Yaplay WebSocket connection closed.");
          break;
        case "error":
          api.log.error("Yaplay WebSocket connection failed.");
          break;
      }
    }

    window.addEventListener("yapmod:yaplay-state", onStateChange);
    api.onCleanup(() => {
      window.removeEventListener("yapmod:yaplay-state", onStateChange);
    });

    // Reconnect when the port setting changes
    api.onCleanup(api.settings.onChange("websocket-port", () => {
      disconnect().then(() => connect());
    }));

    // Update notification sharing when the setting changes
    api.onCleanup(api.settings.onChange("share-notifications", (value) => {
      setShareNotifications(!!value);
    }));

    // Clean up on plugin disable
    api.onCleanup(() => {
      disconnect();
      setShareNotifications(false);
    });

    // Apply initial shareNotifications setting
    setShareNotifications(!!api.settings.get("share-notifications"));

    // Establish initial connection
    connect();

    api.log.info("Yaplay Bridge plugin activated.");
  },
};
