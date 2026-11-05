/**
 * The browser pickers the web target needs.
 *
 * An extension content script cannot ask for an arbitrary file path the way a
 * native app can. It can only receive `File` objects from an `<input>` the user
 * interacts with, so the target turns every picked file into data it owns.
 */
export type PickedDirectory = {
  /** The folder name, used only to give the user a readable status message. */
  name: string;
  /** Top-level files of the folder, keyed by their exact file name. */
  files: Map<string, File>;
};

function openPicker(input: HTMLInputElement): Promise<File[]> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (files: File[]): void => {
      if (settled) {
        return;
      }

      settled = true;
      input.remove();
      window.removeEventListener("focus", onFocus);
      resolve(files);
    };

    const onFocus = (): void => {
      // Chromium fires `cancel` when a picker is dismissed. Browsers without
      // that event regain focus without a `change`, so treat that as a cancel.
      window.setTimeout(() => {
        if (input.files?.length === 0) {
          finish([]);
        }
      }, 300);
    };

    input.addEventListener("change", () => {
      finish([...(input.files ?? [])]);
    });
    input.addEventListener("cancel", () => finish([]));
    window.addEventListener("focus", onFocus, { once: true });

    document.documentElement.append(input);
    input.click();
  });
}

function createInput(type: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = type;
  input.hidden = true;
  input.style.display = "none";
  input.tabIndex = -1;
  return input;
}

/** Opens a file picker and returns the selected files, or an empty list. */
export async function pickFile(accept: string | null | undefined): Promise<File | null> {
  const input = createInput("file");

  if (accept) {
    input.accept = accept;
  }

  const files = await openPicker(input);

  return files[0] ?? null;
}

/**
 * Opens a folder picker and keeps the top-level files of a plugin or theme
 * package. Nested folders are ignored: package files are flat by definition.
 */
export async function pickDirectory(): Promise<PickedDirectory | null> {
  const input = createInput("file");
  input.webkitdirectory = true;
  input.multiple = true;

  const files = await openPicker(input);

  if (files.length === 0) {
    return null;
  }

  const topLevel = new Map<string, File>();
  let name = "";

  for (const file of files) {
    const parts = file.webkitRelativePath.split("/");

    if (parts.length > 2 || parts.length < 2) {
      continue;
    }

    name = name || parts[0];
    topLevel.set(parts[1], file);
  }

  return name ? { name, files: topLevel } : null;
}
