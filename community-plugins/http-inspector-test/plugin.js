/**
 * HTTP Inspector Test Plugin
 *
 * Demonstrates the HTTP Inspector API by:
 * - Subscribing to HTTP exchanges (complete request + response pairs)
 * - Subscribing to outgoing HTTP requests (fires immediately when sent)
 * - Logging requests to the console when enabled
 * - Showing a banner with request counts
 */

return {
  activate(api) {
    let exchangeCount = 0;
    let outgoingCount = 0;
    let bannerInterval = null;

    // Subscribe to complete exchanges (request + response)
    const unsubExchanges = api.http.exchanges.subscribe((message) => {
      exchangeCount++;

      if (api.settings.get("log-messages")) {
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

      if (api.settings.get("log-messages")) {
        console.log(
          "[http-inspector-test] Outgoing request:",
          message.method,
          message.url
        );
      }
    });

    // Persist counts in storage
    api.storage.set("exchange_count", exchangeCount);
    api.storage.set("outgoing_count", outgoingCount);

    // Update banner periodically
    if (api.settings.get("show-banner")) {
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
