/**
 * Quick CSS Plugin
 *
 * Adds a settings panel with a lightweight CSS editor. The editor is built
 * only when the panel is first opened, applies CSS live, and saves to plugin
 * storage automatically. The editor can be detached into a draggable window
 * that stays above the Yapper interface while the user works on a theme.
 */

const STORAGE_KEY = "css";
const STYLE_ID = "quick-css-user-style";
const SAVE_DELAY = 400;
const PLACEHOLDER = `/* Custom CSS for Yapper. Changes are applied as you type. */
:root {
  --accent: #ff6b4a;
}
`;

/**
 * Highlights comments, strings, at-rules, colors, properties, numbers and
 * punctuation. This is intentionally small: a full CSS parser is unnecessary
 * for an editor that only renders text.
 */
const TOKEN_PATTERN = /(\/\*[\s\S]*?(?:\*\/|$))|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(@[-\w]+)|(#[0-9a-fA-F]{3,8}\b)|((?:--)?[-\w]+)(?=\s*:)|(\b\d+(?:\.\d+)?(?:[a-z%]+)?\b)|([{}();:,])/g;

function escapeHtml(value) {
  return value.replace(/[&<>]/g, (character) => {
    if (character === "&") return "&amp;";
    if (character === "<") return "&lt;";
    if (character === ">") return "&gt;";
    return '"';
  });
}

function highlightCss(css) {
  let html = "";
  let lastIndex = 0;
  let match;

  TOKEN_PATTERN.lastIndex = 0;

  while ((match = TOKEN_PATTERN.exec(css)) !== null) {
    html += escapeHtml(css.slice(lastIndex, match.index));

    let kind = "punct";
    if (match[1]) kind = "comment";
    else if (match[2]) kind = "string";
    else if (match[3]) kind = "at-rule";
    else if (match[4]) kind = "value";
    else if (match[5]) kind = "property";
    else if (match[6]) kind = "number";

    html += `<span class="quick-css-token-${kind}">${escapeHtml(match[0])}</span>`;
    lastIndex = match.index + match[0].length;
  }

  html += escapeHtml(css.slice(lastIndex));

  return html || " ";
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function button(label, className, onClick) {
  const element = node("button", className, label);
  element.type = "button";
  element.addEventListener("click", onClick);
  return element;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createEditor({ host, initialCss, applyCss, saveCss }) {
  const shell = node("div", "quick-css-shell");
  const toolbar = node("div", "quick-css-toolbar");
  const actions = node("div", "quick-css-actions");
  const status = node("span", "quick-css-status");
  const floatButton = button("Float editor", "quick-css-btn", toggleFloat);
  const clearButton = button("Clear", "quick-css-btn quick-css-btn-danger", clearEditor);

  status.dataset.state = "saved";
  status.textContent = "Saved";

  actions.append(floatButton, clearButton);
  toolbar.append(actions, status);

  const hint = node(
    "p",
    "quick-css-hint",
    "CSS is applied to Yapper immediately. Changes save automatically while the plugin is enabled.",
  );

  const editor = node("div", "quick-css-editor");
  const gutter = node("pre", "quick-css-gutter");
  gutter.setAttribute("aria-hidden", "true");

  const code = node("div", "quick-css-code");
  const highlight = node("pre", "quick-css-highlight");
  highlight.setAttribute("aria-hidden", "true");
  const highlightedCode = node("code");
  highlight.append(highlightedCode);

  const textarea = node("textarea", "quick-css-input");
  textarea.value = initialCss;
  textarea.placeholder = PLACEHOLDER;
  textarea.spellcheck = false;
  textarea.setAttribute("wrap", "off");
  textarea.setAttribute("aria-label", "Custom CSS");

  code.append(highlight, textarea);
  editor.append(gutter, code);

  const footer = node("div", "quick-css-footer");
  const meta = node("span", "quick-css-meta");
  footer.append(meta);

  shell.append(toolbar, hint, editor, footer);
  host.append(shell);

  let saveTimer = null;
  let frame = null;
  let placeholder = null;
  let removeDrag = null;

  function setStatus(text, state) {
    status.textContent = text;
    status.dataset.state = state;
  }

  function syncScroll() {
    highlight.scrollTop = textarea.scrollTop;
    highlight.scrollLeft = textarea.scrollLeft;
    gutter.scrollTop = textarea.scrollTop;
  }

  function renderEditor() {
    const value = textarea.value;
    const lines = value.split("\n");
    const characters = value.length;

    highlightedCode.innerHTML = highlightCss(value);
    gutter.textContent = lines.map((_, index) => index + 1).join("\n");
    meta.textContent = `${lines.length} ${lines.length === 1 ? "line" : "lines"} · ${characters} ${characters === 1 ? "character" : "characters"}`;
    syncScroll();
  }

  function saveNow() {
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }

    saveCss(textarea.value);
    setStatus("Saved", "saved");
  }

  function updateFromInput() {
    renderEditor();
    applyCss(textarea.value);
    setStatus("Saving…", "saving");

    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
    }

    saveTimer = window.setTimeout(saveNow, SAVE_DELAY);
  }

  function insertNewline() {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const line = value.slice(lineStart, start);
    const indent = (line.match(/^[\t ]*/) || [""])[0];
    const extra = /\{\s*$/.test(value.slice(0, start)) ? "  " : "";

    textarea.setRangeText(`\n${indent}${extra}`, start, end, "end");
    updateFromInput();
  }

  function indentSelection(outdent) {
    const value = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (!outdent && start === end) {
      textarea.setRangeText("  ", start, end, "end");
      updateFromInput();
      return;
    }

    const blockStart = value.lastIndexOf("\n", start - 1) + 1;
    const blockEndBreak = value.indexOf("\n", end);
    const blockEnd = blockEndBreak === -1 ? value.length : blockEndBreak;
    const lines = value.slice(blockStart, blockEnd).split("\n");
    let firstDelta = 0;
    let totalDelta = 0;

    const changed = lines.map((line, index) => {
      if (outdent) {
        const match = line.match(/^ {1,2}/);
        if (!match) return line;

        const delta = -match[0].length;
        if (index === 0) firstDelta = delta;
        totalDelta += delta;
        return line.slice(match[0].length);
      }

      if (index === 0) firstDelta = 2;
      totalDelta += 2;
      return `  ${line}`;
    }).join("\n");

    textarea.setRangeText(changed, blockStart, blockEnd, "start");
    const nextStart = Math.max(blockStart, start + firstDelta);
    const nextEnd = Math.max(nextStart, end + totalDelta);
    textarea.setSelectionRange(nextStart, nextEnd);
    updateFromInput();
  }

  function onKeyDown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveNow();
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      indentSelection(event.shiftKey);
      return;
    }

    if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      insertNewline();
    }
  }

  function clearEditor() {
    if (!textarea.value) return;
    if (!window.confirm("Clear all custom CSS?")) return;

    textarea.value = "";
    updateFromInput();
    saveNow();
    textarea.focus();
  }

  function keepOnScreen() {
    if (!frame) return;

    const rect = frame.getBoundingClientRect();

    if (rect.right > window.innerWidth) {
      frame.style.left = `${Math.max(8, window.innerWidth - rect.width - 8)}px`;
    }

    if (rect.bottom > window.innerHeight) {
      frame.style.top = `${Math.max(8, window.innerHeight - rect.height - 8)}px`;
    }
  }

  function makeDraggable(container, handle) {
    let drag = null;

    function onPointerDown(event) {
      if (event.button !== 0 || event.target.closest("button")) return;

      const rect = container.getBoundingClientRect();
      drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: rect.left,
        top: rect.top,
      };

      handle.setPointerCapture(event.pointerId);
      container.classList.add("quick-css-float-dragging");
      event.preventDefault();
    }

    function onPointerMove(event) {
      if (!drag || drag.id !== event.pointerId) return;

      const left = clamp(
        drag.left + event.clientX - drag.x,
        8,
        Math.max(8, window.innerWidth - 80),
      );
      const top = clamp(
        drag.top + event.clientY - drag.y,
        8,
        Math.max(8, window.innerHeight - 48),
      );

      container.style.left = `${left}px`;
      container.style.top = `${top}px`;
      container.style.right = "auto";
      container.style.bottom = "auto";
    }

    function stopDrag(event) {
      if (!drag || drag.id !== event.pointerId) return;

      drag = null;
      container.classList.remove("quick-css-float-dragging");

      if (handle.hasPointerCapture(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
    }

    handle.addEventListener("pointerdown", onPointerDown);
    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", stopDrag);
    handle.addEventListener("pointercancel", stopDrag);

    return () => {
      handle.removeEventListener("pointerdown", onPointerDown);
      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", stopDrag);
      handle.removeEventListener("pointercancel", stopDrag);
    };
  }

  function floatEditor() {
    if (frame) return;

    frame = node("div", "quick-css-float");
    frame.setAttribute("role", "dialog");
    frame.setAttribute("aria-label", "Quick CSS editor");

    const header = node("div", "quick-css-float-header");
    const title = node("span", "quick-css-float-title", "Quick CSS");
    const dragHint = node("span", "quick-css-float-hint", "Drag to move · resize from the corner");
    const dockButton = button("Dock", "quick-css-btn quick-css-btn-small", dockEditor);
    header.append(title, dragHint, dockButton);

    const body = node("div", "quick-css-float-body");
    body.append(shell);
    frame.append(header, body);

    placeholder = node(
      "p",
      "quick-css-placeholder",
      "The editor is floating above the app. Drag its header to move it, or choose Dock to put it back.",
    );

    host.append(placeholder);
    document.body.append(frame);

    const rect = frame.getBoundingClientRect();
    frame.style.left = `${Math.max(8, window.innerWidth - rect.width - 24)}px`;
    frame.style.top = `${Math.max(8, (window.innerHeight - rect.height) / 2)}px`;
    frame.style.right = "auto";
    frame.style.bottom = "auto";

    removeDrag = makeDraggable(frame, header);
    floatButton.textContent = "Dock editor";
    window.addEventListener("resize", keepOnScreen);
    textarea.focus();
    syncScroll();
  }

  function dockEditor() {
    if (!frame) return;

    const scrollTop = textarea.scrollTop;

    host.append(shell);
    placeholder?.remove();
    placeholder = null;
    removeDrag?.();
    removeDrag = null;
    frame.remove();
    frame = null;
    window.removeEventListener("resize", keepOnScreen);

    floatButton.textContent = "Float editor";
    textarea.focus();
    textarea.scrollTop = scrollTop;
    syncScroll();
  }

  function toggleFloat() {
    if (frame) {
      dockEditor();
    } else {
      floatEditor();
    }
  }

  function focus() {
    window.requestAnimationFrame(() => textarea.focus());
  }

  function destroy() {
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }

    saveCss(textarea.value);
    removeDrag?.();
    removeDrag = null;
    window.removeEventListener("resize", keepOnScreen);
    placeholder?.remove();
    placeholder = null;
    frame?.remove();
    frame = null;
    shell.remove();
  }

  textarea.addEventListener("input", updateFromInput);
  textarea.addEventListener("scroll", syncScroll, { passive: true });
  textarea.addEventListener("keydown", onKeyDown);

  renderEditor();
  applyCss(initialCss);

  return { focus, destroy };
}

export default {
  activate(api) {
    const stored = api.storage.get(STORAGE_KEY, "");
    let css = typeof stored === "string" ? stored : "";

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.append(style);
    api.onCleanup(() => style.remove());

    if (typeof api.settings.registerPanel !== "function") {
      api.log.warn("Quick CSS needs a yapmod build with settings panel support.");
      return;
    }

    let editor = null;

    const unregister = api.settings.registerPanel({
      id: "editor",
      label: "Quick CSS",
      description: "Write CSS for Yapper. Changes are applied immediately and saved automatically.",
      icon: "palette",
      group: "Plugins",
      order: 0,
      render(host) {
        editor = createEditor({
          host,
          initialCss: css,
          applyCss(value) {
            style.textContent = value;
          },
          saveCss(value) {
            css = value;
            api.storage.set(STORAGE_KEY, value);
          },
        });

        return () => {
          editor?.destroy();
          editor = null;
        };
      },
      onShow() {
        editor?.focus();
      },
    });

    api.onCleanup(unregister);
  },
};
