import type { JSX } from "solid-js";
import { render } from "solid-js/web";

export type MountedView = {
  /** The detached host that holds the rendered root. */
  element: HTMLElement;
  /** Disposes the Solid reactive root. */
  dispose: () => void;
};

/**
 * Renders a component into a detached host element.
 *
 * Used by the features that hand a plain DOM node to the host application
 * (modals, banners, update prompts). The caller owns disposal.
 */
export function mountView(component: () => JSX.Element): MountedView {
  const host = document.createElement("div");
  const dispose = render(component, host);
  return { element: host, dispose };
}

/**
 * Renders a component and returns its single root element.
 *
 * The reactive root is disposed immediately because the element is detached
 * from Solid and owned by the caller afterwards.
 */
export function renderElement<T extends HTMLElement = HTMLElement>(
  component: () => JSX.Element,
): T {
  const host = document.createElement("div");
  const dispose = render(component, host);
  const element = host.firstElementChild as T;
  dispose();
  return element;
}
