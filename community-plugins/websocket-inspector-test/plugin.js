/**
 * WebSocket Inspector Test Plugin
 *
 * Demonstrates the WebSocket Inspector API by:
 * - Subscribing to incoming and outgoing WebSocket messages
 * - Logging messages to the console when enabled
 * - Showing a banner with message counts
 * - Using an outgoing interceptor to tag messages
 */

return {
  activate(api) {
    let incomingCount = 0;
    let outgoingCount = 0;
    let bannerInterval = null;

    const logMessages = api.settings.get("log-messages");
    const showBanner = api.settings.get("show-banner");

    // Subscribe to incoming messages
    const unsubIncoming = api.webSocket.incoming.subscribe((message) => {
      incomingCount++;

      if (logMessages) {
        console.log(
          "[ws-inspector-test] Incoming message from",
          message.url,
          "-",
          typeof message.data === "string"
            ? message.data.substring(0, 100)
            : `[binary: ${message.data.byteLength || message.data.size || 0} bytes]`
        );
      }
    });

    // Subscribe to outgoing messages
    const unsubOutgoing = api.webSocket.outgoing.subscribe((message) => {
      outgoingCount++;

      if (logMessages) {
        console.log(
          "[ws-inspector-test] Outgoing message to",
          message.url,
          "-",
          typeof message.data === "string"
            ? message.data.substring(0, 100)
            : `[binary: ${message.data.byteLength || message.data.size || 0} bytes]`
        );
      }
    });

    // Register an outgoing interceptor that tags messages
    const unuseInterceptor = api.webSocket.outgoing.use((message) => {
      // Only modify string messages
      if (typeof message.data === "string") {
        // Add a comment-like suffix to demonstrate interception
        // Return undefined to leave the message unchanged
        return undefined;
      }
      return undefined;
    });

    // Persist counts in storage
    api.storage.set("incoming_count", incomingCount);
    api.storage.set("outgoing_count", outgoingCount);

    // Update banner periodically
    if (showBanner) {
      updateBanner();
      bannerInterval = setInterval(updateBanner, 2000);
    }

    function updateBanner() {
      const total = incomingCount + outgoingCount;
      if (total > 0) {
        api.banner(
          `WebSocket Inspector: ${incomingCount} incoming, ${outgoingCount} outgoing (${total} total)`
        );
      }
    }

    // Listen for setting changes
    const unsubLogSetting = api.settings.onChange("log-messages", () => {
      // Setting changed, the next message will use the new value
    });
    const unsubBannerSetting = api.settings.onChange("show-banner", (value) => {
      if (value && !bannerInterval) {
        updateBanner();
        bannerInterval = setInterval(updateBanner, 2000);
      } else if (!value && bannerInterval) {
        clearInterval(bannerInterval);
        bannerInterval = null;
      }
    });

    // Return cleanup function
    return () => {
      unsubIncoming();
      unsubOutgoing();
      unuseInterceptor();
      unsubLogSetting();
      unsubBannerSetting();
      if (bannerInterval) {
        clearInterval(bannerInterval);
        bannerInterval = null;
      }
      api.storage.set("incoming_count", incomingCount);
      api.storage.set("outgoing_count", outgoingCount);
    };
  },
};
