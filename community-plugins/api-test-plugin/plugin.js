/**
 * API Test Plugin
 *
 * Demonstrates the Modal and Notifications APIs by:
 * - Showing a welcome modal dialog on activation
 * - Displaying a system notification on activation
 * - Showing a confirmation modal with async button handler
 * - Using settings to control which features are enabled
 */

return {
  activate(api) {
    // Show a simple welcome modal
    if (api.settings.get("show-welcome-modal")) {
      api.modal.show({
        title: "🧩 API Test Plugin",
        description: "Welcome to the API Test Plugin!",
        content: "This plugin demonstrates the Modal and Notifications APIs. You can configure its behavior in the plugin settings.",
        buttons: [
          {
            label: "Got it!",
            variant: "primary",
            autofocus: true
          }
        ],
        autoFocus: true,
        size: "sm"
      });
    }

    // Show a system notification
    if (api.settings.get("show-notification")) {
      api.notify.show({
        title: "API Test Plugin",
        body: "Plugin activated successfully! 🎉",
        tag: "activation",
        onClick: () => {
          api.log.info("Notification clicked!");
        }
      });
    }

    // Show a confirmation modal with async button handler
    if (api.settings.get("show-confirm-modal")) {
      const modal = api.modal.show({
        title: "Confirm Action",
        description: "This demonstrates an async button handler.",
        content: "Click 'Confirm' to see the button disable while processing, then re-enable after completion.",
        buttons: [
          {
            label: "Cancel",
            variant: "secondary"
          },
          {
            label: "Confirm",
            variant: "primary",
            onClick: async (modal) => {
              api.log.info("Confirm button clicked, simulating async work...");
              // Simulate async work
              await new Promise((resolve) => setTimeout(resolve, 2000));
              api.log.info("Async work completed!");
              // Show a follow-up notification
              api.notify.show({
                title: "Action Completed",
                body: "The async button handler finished successfully.",
                tag: "action-completed"
              });
            }
          }
        ],
        autoFocus: true
      });

      // Wait for the modal to close and log the reason
      modal.closed.then((reason) => {
        api.log.info(`Modal closed with reason: ${reason}`);
      });
    }

    // Demonstrate modal.create() + .open() pattern
    // Create a modal that can be opened later
    const helpModal = api.modal.create({
      title: "Plugin Help",
      description: "How to use this plugin",
      html: `
        <div style="padding: 10px 0;">
          <p>This plugin tests the following APIs:</p>
          <ul>
            <li><strong>api.modal</strong> - Open modal dialogs</li>
            <li><strong>api.notify</strong> - Show system notifications</li>
            <li><strong>api.settings</strong> - Plugin toggle settings</li>
            <li><strong>api.storage</strong> - Key-value storage</li>
            <li><strong>api.log</strong> - Namespaced logging</li>
          </ul>
        </div>
      `,
      buttons: [
        {
          label: "Close",
          variant: "primary",
          autofocus: true
        }
      ],
      autoFocus: true,
      size: "md"
    });

    // Store the modal reference so it can be opened later
    // (In a real plugin, you might trigger this from a button or shortcut)
    api.storage.set("has-help-modal", true);
    api.log.info("API Test Plugin activated with help modal ready");

    // Return cleanup function
    return () => {
      api.log.info("API Test Plugin deactivated");
      // Close any open modals from this plugin
      for (const modal of api.modal.active) {
        modal.close();
      }
    };
  },
};
