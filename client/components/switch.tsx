import { createSignal, JSX } from "solid-js";

export type SwitchProps = {
  checked: boolean;
  /** Accessible name for the switch, kept specific to the action it controls. */
  label: string;
  disabled?: boolean;
  /**
   * Applies the new state. Return `false` (or throw) when the change was
   * cancelled or failed so the switch snaps back to the state it came from.
   */
  onChange: (checked: boolean) => boolean | void | Promise<boolean | void>;
};

/**
 * The host's switch control with a guarded change handler.
 *
 * A cancelled installation or a failed activation can leave the checkbox in
 * the new position while the stored state stays the same, so the handler
 * restores the previous state when `onChange` reports a failure.
 */
export function Switch(props: SwitchProps): JSX.Element {
  const [busy, setBusy] = createSignal(false);

  async function handleChange(event: Event & { currentTarget: HTMLInputElement }): Promise<void> {
    const input = event.currentTarget;
    const next = input.checked;

    setBusy(true);

    try {
      const result = await props.onChange(next);

      if (result === false) {
        input.checked = !next;
      }
    } catch (error) {
      input.checked = !next;
      console.error("[yapmod] switch change failed", error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <input
      class="switch yapmod-package-switch"
      type="checkbox"
      role="switch"
      aria-label={props.label}
      title={props.label}
      checked={props.checked}
      disabled={props.disabled || busy()}
      onChange={(event) => void handleChange(event)}
    />
  );
}
