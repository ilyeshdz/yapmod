import { getYapmod } from "../../core/scope";
import { getHost } from "../../platform/host";

const ISSUE_URL = "https://github.com/ilyeshdz/yapmod/issues/new";
const DEFAULT_TITLE = "[Bug] ";

export type BugReportField = {
  label: string;
  value: string;
};

export type BugReportDetails = {
  host: "desktop" | "web";
  hostLabel: string;
  fields: BugReportField[];
};

function hostLabel(): { host: "desktop" | "web"; label: string } {
  const host = getHost();

  if (host.id === "desktop") {
    return { host: "desktop", label: "Yapmod desktop" };
  }

  return { host: "web", label: "Yapmod browser extension" };
}

function formatVersion(version: string | undefined): string {
  const value = version?.trim();

  return value ? `v${value}` : "unknown";
}

function themeDescription(): string {
  const active = getYapmod().theme?.active;

  if (!active) {
    return "Yapin default";
  }

  return active.version ? `${active.name} v${active.version}` : active.name;
}

function enabledPlugins(): string {
  try {
    const plugins = getYapmod().plugins?.list() ?? [];
    const names = plugins
      .filter((plugin) => plugin.enabled)
      .map((plugin) => plugin.manifest.name);

    return names.length > 0 ? names.join(", ") : "None";
  } catch {
    return "Unknown";
  }
}

function screenDescription(): string {
  const screen = window.screen;

  if (!screen || !screen.width || !screen.height) {
    return "Unknown";
  }

  const scale = window.devicePixelRatio;

  return scale && Number.isFinite(scale)
    ? `${screen.width}×${screen.height} @${scale}x`
    : `${screen.width}×${screen.height}`;
}

function pageLocation(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

/**
 * Collects the technical details that make a bug report actionable.
 *
 * The details are intentionally limited to the environment: no messages,
 * account data or query strings are included.
 */
export function collectBugReportDetails(): BugReportDetails {
  const yapmod = getYapmod();
  const host = getHost();
  const environment = hostLabel();
  const releaseVersion = yapmod.release?.version ?? host.version;
  const clientVersion = yapmod.clientVersion ?? host.version;

  const fields: BugReportField[] = [
    { label: "Host", value: environment.label },
    {
      label: environment.host === "desktop" ? "Desktop app" : "Extension",
      value: formatVersion(releaseVersion),
    },
    {
      label: "Client",
      value: formatVersion(clientVersion),
    },
    {
      label: "Platform",
      value: yapmod.os || host.platform || "Unknown",
    },
    {
      label: "Language",
      value: navigator.language || "Unknown",
    },
    {
      label: "Screen",
      value: screenDescription(),
    },
    {
      label: "Theme",
      value: themeDescription(),
    },
    {
      label: "Active plugins",
      value: enabledPlugins(),
    },
    {
      label: "Page",
      value: pageLocation(),
    },
    {
      label: "User agent",
      value: navigator.userAgent || "Unknown",
    },
  ];

  return {
    host: environment.host,
    hostLabel: environment.label,
    fields,
  };
}

function issueTitle(description: string): string {
  const firstLine = description.trim().split(/\r?\n/, 1)[0]?.trim();

  if (!firstLine) {
    return DEFAULT_TITLE.trimEnd();
  }

  return `${DEFAULT_TITLE}${firstLine}`.slice(0, 120);
}

/**
 * Builds the markdown a user can paste into an issue.
 *
 * The format mirrors GitHub's issue editor, so the copied text and the
 * prefilled issue look the same.
 */
export function buildBugReport(
  details: BugReportDetails,
  description: string,
): string {
  const body = description.trim();
  const lines = [
    "### What happened?",
    "",
    body || "_No description provided._",
    "",
    "### System information",
    "",
    ...details.fields.map(
      (field) => `- **${field.label}:** ${field.value}`,
    ),
    "",
    `_Reported with ${details.hostLabel} on ${new Date().toISOString()}_`,
  ];

  return lines.join("\n");
}

/**
 * Builds a link that opens GitHub's new-issue form with the title and body
 * already filled in.
 */
export function createIssueUrl(
  details: BugReportDetails,
  description: string,
): string {
  const params = new URLSearchParams({
    title: issueTitle(description),
    body: buildBugReport(details, description),
  });

  return `${ISSUE_URL}?${params.toString()}`;
}

/**
 * Copies text to the clipboard.
 *
 * The async clipboard API needs a secure context, which older webviews do not
 * always provide, so this falls back to the selection-based API.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the selection-based fallback.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "-9999px";
    textarea.style.opacity = "0";

    document.body.appendChild(textarea);
    textarea.select();

    const copied = document.execCommand("copy");
    textarea.remove();

    return copied;
  } catch {
    return false;
  }
}
