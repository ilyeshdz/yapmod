/**
 * Quick CSS Plugin
 *
 * Adds a settings panel with a Monaco CSS editor. Monaco is fetched lazily the
 * first time the panel opens; a small textarea fallback keeps the plugin usable
 * when the CDN cannot be reached. CSS is applied live and saved automatically.
 * The editor can be detached into a draggable window above the Yapper page.
 */

const STORAGE_KEY = "css";
const STYLE_ID = "quick-css-user-style";
const SAVE_DELAY = 400;
const MONACO_VERSION = "0.52.2";
const MONACO_BASE = `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min`;
const MONACO_THEME = "quick-css";

let monacoPromise = null;
let monacoWorkerUrl = null;

function isLightMode() {
  const root = document.documentElement;

  if (root.dataset.yapmodMode) return root.dataset.yapmodMode === "light";
  if (root.dataset.theme) return root.dataset.theme === "light";

  return window.matchMedia("(prefers-color-scheme: light)").matches;
}

function readToken(styles, name, fallback) {
  return styles.getPropertyValue(name).trim() || fallback;
}

function defineMonacoTheme(monaco) {
  const light = isLightMode();
  const styles = window.getComputedStyle(document.documentElement);
  const token = (name, fallback) => readToken(styles, name, fallback);
  const background = token("--ym-bg-main", light ? "#ffffff" : "#222329");
  const foreground = token("--ym-text", light ? "#1d1f23" : "#ececf1");

  monaco.editor.defineTheme(MONACO_THEME, {
    base: light ? "vs" : "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": background,
      "editor.foreground": foreground,
      "editorGutter.background": background,
      "editorLineNumber.foreground": token("--ym-text-faint", "#6e6f7b"),
      "editorLineNumber.activeForeground": token("--ym-text-muted", "#9c9daa"),
      "editorCursor.foreground": token("--ym-accent", "#ff6b4a"),
      "editor.selectionBackground": token("--ym-accent-soft", "#ff6b4a29"),
      "editor.lineHighlightBackground": token("--ym-bg-hover", "#2f3038"),
      "editorIndentGuide.background1": token("--ym-border", "#ffffff12"),
      "editorWidget.background": token("--ym-bg-elev", "#2b2c33"),
      "editorWidget.border": token("--ym-border", "#ffffff12"),
      "editorSuggestWidget.background": token("--ym-bg-elev", "#2b2c33"),
      "editorSuggestWidget.border": token("--ym-border", "#ffffff12"),
      "editorSuggestWidget.selectedBackground": token("--ym-bg-active", "#383944"),
      "editorHoverWidget.background": token("--ym-bg-elev", "#2b2c33"),
      "editorHoverWidget.border": token("--ym-border", "#ffffff12"),
    },
  });
}

/** Loads the Monaco AMD bundle only when the editor is first opened. */
function loadMonaco() {
  if (window.monaco) {
    return Promise.resolve(window.monaco);
  }

  if (monacoPromise) {
    return monacoPromise;
  }

  monacoPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-quick-css-monaco]');
    existing?.remove();

    monacoWorkerUrl ??= URL.createObjectURL(new Blob(
      [
        `self.MonacoEnvironment = { baseUrl: '${MONACO_BASE}/' };`,
        `importScripts('${MONACO_BASE}/vs/base/worker/workerMain.js');`,
      ],
      { type: "text/javascript" },
    ));

    window.MonacoEnvironment = {
      getWorkerUrl() {
        return monacoWorkerUrl;
      },
    };

    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      script.remove();
      reject(new Error("Timed out while loading Monaco."));
    }, 20000);

    script.src = `${MONACO_BASE}/vs/loader.js`;
    script.async = true;
    script.dataset.quickCssMonaco = "true";

    script.onload = () => {
      window.clearTimeout(timeout);

      const loader = window.require;

      if (!loader || typeof loader.config !== "function") {
        reject(new Error("The Monaco loader did not initialize."));
        return;
      }

      loader.config({ paths: { vs: `${MONACO_BASE}/vs` } });
      loader(["vs/editor/editor.main"], () => resolve(window.monaco), reject);
    };

    script.onerror = () => {
      window.clearTimeout(timeout);
      script.remove();
      reject(new Error("Could not download Monaco."));
    };

    document.head.append(script);
  }).catch((error) => {
    monacoPromise = null;
    document.querySelector('script[data-quick-css-monaco]')?.remove();
    throw error;
  });

  return monacoPromise;
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createEditor({ api, host, initialCss, applyCss, saveCss }) {
  const shell = node("div", "quick-css-shell");
  const toolbarStart = node("div", "quick-css-toolbar-group");
  const toolbarEnd = node("div", "quick-css-toolbar-group");
  const title = node("span", "quick-css-title");
  const status = api.ui.badge("Saved", { tone: "success" });

  title.append(api.ui.icon("code", { size: 15 }), node("span", undefined, "styles.css"));
  toolbarStart.append(title, status);

  const saveButton = api.ui.button({
    icon: "save",
    title: "Save now",
    variant: "ghost",
    size: "small",
    onClick: saveNow,
  });
  const floatButton = api.ui.button({
    icon: "float",
    title: "Float editor",
    variant: "ghost",
    size: "small",
    onClick: toggleFloat,
  });
  const clearButton = api.ui.button({
    icon: "trash",
    title: "Clear CSS",
    variant: "danger",
    size: "small",
    onClick: clearEditor,
  });

  toolbarEnd.append(saveButton, floatButton, clearButton);

  const toolbar = api.ui.toolbar(toolbarStart, toolbarEnd);
  const hint = node(
    "p",
    "quick-css-hint",
    "CSS is applied immediately and saved automatically. Monaco loads on first open.",
  );

  const editor = node("div", "quick-css-editor");
  const editorHost = node("div", "quick-css-editor-host");
  const loading = node("div", "quick-css-loading");

  loading.append(
    api.ui.icon("refresh", { size: 24, class: "quick-css-loading-icon" }),
    node("span", undefined, "Loading Monaco…"),
  );
  editorHost.append(loading);
  editor.append(editorHost);

  const footer = node("div", "quick-css-footer");
  const meta = node("span", "quick-css-meta", "Preparing editor…");
  const engine = api.ui.badge("Loading", { tone: "accent" });

  footer.append(meta, engine);

  shell.append(toolbar, hint, editor, footer);
  host.append(shell);

  let monacoEditor = null;
  let fallback = null;
  let destroyed = false;
  let saveTimer = null;
  let frame = null;
  let placeholder = null;
  let removeDrag = null;
  let changeDisposable = null;
  let cursorDisposable = null;
  let themeObserver = null;

  function setStatus(text, tone) {
    status.textContent = text;
    status.dataset.tone = tone;
  }

  function setEngine(text, tone) {
    engine.textContent = text;
    engine.dataset.tone = tone;
  }

  function getValue() {
    if (monacoEditor) return monacoEditor.getValue();
    if (fallback) return fallback.value;
    return initialCss;
  }

  function renderMeta(value) {
    const characters = value.length;
    const suffix = `${characters} ${characters === 1 ? "char" : "chars"}`;

    if (monacoEditor) {
      const position = monacoEditor.getPosition();
      const line = position?.lineNumber ?? 1;
      const column = position?.column ?? 1;
      meta.textContent = `Ln ${line}, Col ${column} · ${suffix}`;
      return;
    }

    const lines = value.split("\n").length;
    meta.textContent = `${lines} ${lines === 1 ? "line" : "lines"} · ${suffix}`;
  }

  function saveNow() {
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }

    const value = getValue();
    saveCss(value);
    setStatus("Saved", "success");
    renderMeta(value);
  }

  function handleChange(value) {
    renderMeta(value);
    applyCss(value);
    setStatus("Saving…", "warning");

    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
    }

    saveTimer = window.setTimeout(saveNow, SAVE_DELAY);
  }

  function relayout() {
    window.requestAnimationFrame(() => monacoEditor?.layout());
  }

  function mountMonaco(monaco) {
    if (destroyed) return;

    defineMonacoTheme(monaco);
    editorHost.replaceChildren();

    monacoEditor = monaco.editor.create(editorHost, {
      value: initialCss,
      language: "css",
      theme: MONACO_THEME,
      ariaLabel: "Custom CSS",
      automaticLayout: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: 13,
      lineHeight: 20,
      tabSize: 2,
      insertSpaces: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: "off",
      fixedOverflowWidgets: true,
      renderLineHighlight: "all",
      padding: { top: 10, bottom: 10 },
      scrollbar: {
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
      },
    });

    monacoEditor.getModel()?.updateOptions({ tabSize: 2, insertSpaces: true });
    changeDisposable = monacoEditor.onDidChangeModelContent(() => handleChange(monacoEditor.getValue()));
    cursorDisposable = monacoEditor.onDidChangeCursorPosition(() => renderMeta(monacoEditor.getValue()));
    monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveNow);

    themeObserver = new MutationObserver(() => {
      defineMonacoTheme(monaco);
      monaco.editor.setTheme(MONACO_THEME);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-yapmod-mode", "data-theme"],
    });

    setEngine("Monaco", "accent");
    setStatus("Saved", "success");
    renderMeta(initialCss);
    monacoEditor.layout();
  }

  function onFallbackKeyDown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveNow();
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();

      const start = fallback.selectionStart;
      const end = fallback.selectionEnd;
      fallback.setRangeText("  ", start, end, "end");
      handleChange(fallback.value);
    }
  }

  function mountFallback(error) {
    if (destroyed) return;

    api.log.warn("Monaco could not be loaded; using the basic editor.", error);
    editorHost.replaceChildren();

    fallback = node("textarea", "quick-css-fallback");
    fallback.value = initialCss;
    fallback.spellcheck = false;
    fallback.setAttribute("wrap", "off");
    fallback.setAttribute("aria-label", "Custom CSS");
    fallback.addEventListener("input", () => handleChange(fallback.value));
    fallback.addEventListener("keydown", onFallbackKeyDown);
    editorHost.append(fallback);

    setEngine("Basic editor", "warning");
    setStatus("Saved", "success");
    renderMeta(initialCss);
    fallback.focus();
  }

  function focus() {
    window.requestAnimationFrame(() => {
      monacoEditor?.layout();

      if (monacoEditor) {
        monacoEditor.focus();
      } else {
        fallback?.focus();
      }
    });
  }

  function clearEditor() {
    if (!getValue()) return;
    if (!window.confirm("Clear all custom CSS?")) return;

    if (monacoEditor) {
      monacoEditor.setValue("");
    } else if (fallback) {
      fallback.value = "";
      handleChange("");
    }

    saveNow();
    focus();
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

  function setFloatButton(floating) {
    floatButton.replaceChildren(
      api.ui.icon(floating ? "dock" : "float", { size: 15 }),
    );

    const title = floating ? "Dock editor" : "Float editor";
    floatButton.title = title;
    floatButton.setAttribute("aria-label", title);
  }

  function floatEditor() {
    if (frame) return;

    frame = node("div", "quick-css-float");
    frame.setAttribute("role", "dialog");
    frame.setAttribute("aria-label", "Quick CSS editor");

    const header = node("div", "quick-css-float-header");
    const headerTitle = node("span", "quick-css-float-title");
    const dragHint = node("span", "quick-css-float-hint", "Drag to move · resize from the corner");
    const dockButton = api.ui.button({
      icon: "dock",
      title: "Dock editor",
      variant: "ghost",
      size: "small",
      onClick: dockEditor,
    });

    headerTitle.append(api.ui.icon("code", { size: 15 }), node("span", undefined, "Quick CSS"));
    header.append(headerTitle, dragHint, dockButton);

    const body = node("div", "quick-css-float-body");
    body.append(shell);
    frame.append(header, body);

    placeholder = node(
      "p",
      "quick-css-placeholder",
      "The editor is floating above the app. Drag its header to move it, or dock it to return.",
    );

    host.append(placeholder);
    document.body.append(frame);

    const rect = frame.getBoundingClientRect();
    frame.style.left = `${Math.max(8, window.innerWidth - rect.width - 24)}px`;
    frame.style.top = `${Math.max(8, (window.innerHeight - rect.height) / 2)}px`;
    frame.style.right = "auto";
    frame.style.bottom = "auto";

    removeDrag = makeDraggable(frame, header);
    setFloatButton(true);
    window.addEventListener("resize", keepOnScreen);
    relayout();
    focus();
  }

  function dockEditor() {
    if (!frame) return;

    host.append(shell);
    placeholder?.remove();
    placeholder = null;
    removeDrag?.();
    removeDrag = null;
    frame.remove();
    frame = null;
    window.removeEventListener("resize", keepOnScreen);

    setFloatButton(false);
    relayout();
    focus();
  }

  function toggleFloat() {
    if (frame) {
      dockEditor();
    } else {
      floatEditor();
    }
  }

  function destroy() {
    destroyed = true;

    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }

    saveCss(getValue());
    themeObserver?.disconnect();
    themeObserver = null;
    changeDisposable?.dispose();
    changeDisposable = null;
    cursorDisposable?.dispose();
    cursorDisposable = null;
    monacoEditor?.dispose();
    monacoEditor = null;
    fallback?.remove();
    fallback = null;
    removeDrag?.();
    removeDrag = null;
    window.removeEventListener("resize", keepOnScreen);
    placeholder?.remove();
    placeholder = null;
    frame?.remove();
    frame = null;
    shell.remove();
  }

  loadMonaco().then(mountMonaco).catch(mountFallback);

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
          api,
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
