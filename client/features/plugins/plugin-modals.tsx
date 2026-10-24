import { For, Show, JSX } from "solid-js";
import { render } from "solid-js/web";

import type {
  PluginBundle,
  PluginManifest,
} from "../../shared/types";

export type PluginSettingsDraft = Map<string, boolean>;

/** The warning shown before a plugin is imported or enabled. */
export function PluginConsent(
  props: { manifest: PluginManifest },
): JSX.Element {
  const manifest = props.manifest;
  const title = () =>
    `${manifest.name}${manifest.author ? ` by ${manifest.author}` : ""}${
      manifest.version ? ` · version ${manifest.version}` : ""
    } is asking to be installed.`;

  return (
    <div>
      <p>{title()}</p>
      <p>
        {manifest.script
          ? "This plugin runs JavaScript directly in the Yapper window. It can read and change the page, interact with functionality available to that page, and access sensitive data visible there. It is not sandboxed or isolated. Installing it means trusting its author and accepting these risks."
          : "This plugin can change or imitate the Yapper interface through CSS. Plugins are not reviewed or guaranteed safe; only install packages you trust."}
      </p>
      <Show when={manifest.description}>
        <p>{manifest.description}</p>
      </Show>
      <p>
        {manifest.script
          ? "This package contains plugin.js. It is loaded only after this confirmation."
          : "This package does not contain JavaScript."}
      </p>
    </div>
  );
}

/** The settings of a plugin, edited as a draft until the modal is saved. */
export function PluginSettingsForm(
  props: { manifest: PluginManifest; draft: PluginSettingsDraft },
): JSX.Element {
  return (
    <div class="yapmod-plugin-settings-modal">
      <For each={props.manifest.settings}>
        {(setting) => (
          <label class="toggle-row yapmod-plugin-setting-row">
            <span>
              <div class="toggle-label">{setting.label}</div>
              <Show when={setting.description}>
                <div class="hint">{setting.description}</div>
              </Show>
            </span>
            <input
              class="switch"
              type="checkbox"
              aria-label={setting.label}
              checked={props.draft.get(setting.id) ?? setting.default}
              onChange={(event) => {
                props.draft.set(setting.id, event.currentTarget.checked);
              }}
            />
          </label>
        )}
      </For>
    </div>
  );
}

function SourceFile(
  props: { filename: string; source: string },
): JSX.Element {
  return (
    <details class="yapmod-plugin-source-file">
      <summary>{props.filename}</summary>
      <pre class="yapmod-plugin-source-code">
        <code>{props.source}</code>
      </pre>
    </details>
  );
}

/** The installed package source, for review. */
export function PluginSourceViewer(
  props: { bundle: PluginBundle },
): JSX.Element {
  return (
    <div class="yapmod-plugin-source-viewer">
      <p class="yapmod-plugin-source-note">
        These are the package contents loaded by Yapmod. Community plugins are
        copied to this local installation and can be reviewed here.
      </p>
      <SourceFile
        filename="manifest.json"
        source={JSON.stringify(props.bundle.manifest, null, 2)}
      />
      <SourceFile filename="plugin.css" source={props.bundle.css} />
      <Show when={props.bundle.script !== null}>
        <SourceFile filename="plugin.js" source={props.bundle.script!} />
      </Show>
    </div>
  );
}

/**
 * Renders content that the modal API receives as a plain node.
 * The caller disposes the root when the modal closes.
 */
export function mountDialogContent(
  content: () => JSX.Element,
): { element: HTMLElement; dispose: () => void } {
  const host = document.createElement("div");
  const dispose = render(content, host);

  return { element: host, dispose };
}
