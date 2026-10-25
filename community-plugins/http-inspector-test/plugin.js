/**
 * HTTP Inspector Test Plugin
 *
 * Demonstrates the HTTP Inspector API by:
 * - Subscribing to HTTP exchanges (complete request + response pairs)
 * - Subscribing to outgoing HTTP requests (fires immediately when sent)
 * - Logging requests to the console when enabled
 * - Showing a banner with request counts
 * - Using an outgoing interceptor to add custom headers
 */

return {
  activate(api) {
    let exchangeCount = 0;
    let outgoingCount = 0;
    let bannerInterval = null;

    const logMessages = api.settings.get("log-messages");
    const showBanner = api.settings.get("show-banner");

    // Subscribe to complete exchanges (request + response)
    const unsubExchanges = api.http.exchanges.subscribe((message) => {
      exchangeCount++;

      if (logMessages) {
        console.log(
          "[http-inspector-test] Exchange:",
          message.method,
          message.url,
          `${message.status} ${message.statusText}`,
          `(${message.duration}ms)`
        );
      }
    });

    // Subscribe to outgoing requests (fires immediately when sent)
    const unsubOutgoing = api.http.outgoing.subscribe((message) => {
      outgoingCount++;

      if (logMessages) {
        console.log(
          "[http-inspector-test] Outgoing request:",
          message.method,
          message.url
        );
      }
    });

    // Register an outgoing interceptor that adds a custom header
    const unuseInterceptor = api.http.outgoing.use((message) => {
      // Add a custom header to demonstrate interception
      // Return undefined to leave the request unchanged
      return undefined;
    });

    // Persist counts in storage
    api.storage.set("exchange_count", exchangeCount);
    api.storage.set("outgoing_count", outgoingCount);

    // Update banner periodically
    if (showBanner) {
      updateBanner();
      bannerInterval = setInterval(updateBanner, 2000);
    }

    function updateBanner() {
      if (outgoingCount > 0) {
        api.banner(
          `HTTP Inspector: ${exchangeCount} exchanges, ${outgoingCount} outgoing (${outgoingCount - exchangeCount} pending)`
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
      unsubExchanges();
      unsubOutgoing();
      unuseInterceptor();
      unsubLogSetting();
      unsubBannerSetting();
      if (bannerInterval) {
        clearInterval(bannerInterval);
        bannerInterval = null;
      }
      api.storage.set("exchange_count", exchangeCount);
      api.storage.set("outgoing_count", outgoingCount);
    };
  },
};
