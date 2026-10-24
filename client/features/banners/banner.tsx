import { Show, JSX } from "solid-js";

import type { BannerTone, YapmodBanner } from "./api";

export type BannerViewProps = {
  message: string;
  tone: BannerTone;
  dismissible: boolean;
  action?: {
    label: string;
    onClick: (banner: YapmodBanner) => void | Promise<void>;
  };
  banner: YapmodBanner;
  onDismiss: () => void;
};

/**
 * One nonblocking banner.
 *
 * It is rendered without a wrapper element so the region only ever holds
 * `.yapmod-banner` nodes.
 */
export function BannerView(props: BannerViewProps): JSX.Element {
  return (
    <div
      class="yapmod-banner"
      role={props.tone === "warning" ? "alert" : "status"}
      data-tone={props.tone}
    >
      <span class="yapmod-banner-message">{props.message}</span>
      <Show when={props.action}>
        <button
          class="yapmod-banner-action"
          type="button"
          onClick={() => {
            void Promise.resolve(props.action?.onClick(props.banner)).catch(
              (error) => {
                console.error("[yapmod] banner action failed", error);
              },
            );
          }}
        >
          {props.action?.label}
        </button>
      </Show>
      <Show when={props.dismissible}>
        <button
          class="yapmod-banner-dismiss"
          type="button"
          aria-label="Dismiss notification"
          onClick={props.onDismiss}
        >
          ×
        </button>
      </Show>
    </div>
  );
}
