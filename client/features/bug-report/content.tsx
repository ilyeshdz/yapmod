import { For, createSignal } from "solid-js";

import { mountView } from "../../shared/solid";
import type { BugReportDetails } from "./details";

const DESCRIPTION_ID = "yapmod-bug-report-description";

export type BugReportStatusTone = "success" | "error";

export type BugReportView = {
  element: HTMLElement;
  /** The issue description typed by the user. */
  description(): string;
  /** Shows a short message under the form. */
  setStatus(message: string, tone?: BugReportStatusTone): void;
  dispose(): void;
};

/** Renders the report form and exposes the description and status helpers. */
export function mountBugReport(details: BugReportDetails): BugReportView {
  const [description, setDescription] = createSignal("");
  let status!: HTMLParagraphElement;

  const mounted = mountView(() => (
    <div class="yapmod-bug-report">
      <div class="yapmod-bug-report-field">
        <label class="yapmod-bug-report-label" for={DESCRIPTION_ID}>
          What happened?
        </label>
        <textarea
          id={DESCRIPTION_ID}
          class="yapmod-bug-report-description"
          rows={5}
          maxLength={4000}
          autofocus
          placeholder="Describe the problem, what you expected and what happened instead."
          onInput={(event) => {
            setDescription(event.currentTarget.value);
          }}
        />
        <p class="hint">
          Include the steps that led to the problem. Screenshots can be added on
          GitHub after the issue is created.
        </p>
      </div>

      <section class="yapmod-bug-report-info" aria-label="System information">
        <h3>System information</h3>
        <dl class="yapmod-bug-report-fields">
          <For each={details.fields}>
            {(field) => (
              <>
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </>
            )}
          </For>
        </dl>
        <p class="hint">
          This only includes technical details. It does not include your
          messages or account information.
        </p>
      </section>

      <p
        ref={status}
        class="yapmod-bug-report-status"
        role="status"
        aria-live="polite"
      />
    </div>
  ));

  return {
    element: mounted.element,
    description: () => description(),
    setStatus(message, tone) {
      status.textContent = message;

      if (tone) {
        status.dataset.tone = tone;
      } else {
        delete status.dataset.tone;
      }
    },
    dispose: mounted.dispose,
  };
}
