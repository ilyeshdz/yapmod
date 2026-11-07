import { openExternally } from "../../core/links";
import { getYapmod } from "../../core/scope";
import { ensureStyle } from "../../shared/ui";
import { mountBugReport } from "./content";
import {
  buildBugReport,
  collectBugReportDetails,
  copyText,
  createIssueUrl,
} from "./details";
import bugReportCSS from "../../styles/bug-report.css";

const MODAL_ID = "yapmod-bug-report";
const STYLE_ID = "yapmod-bug-report-styles";

function ensureBugReportStyles(): void {
  ensureStyle(STYLE_ID, bugReportCSS);
}

/**
 * Opens the report form with the technical details of this installation and
 * the actions that hand the report to GitHub.
 */
export function openBugReport(): void {
  const yapmod = getYapmod();
  const modal = yapmod.modal;

  if (!modal) {
    return;
  }

  ensureBugReportStyles();

  const details = collectBugReportDetails();
  const view = mountBugReport(details);

  modal.show({
    id: MODAL_ID,
    title: "Report a bug",
    description:
      "Describe the issue, then copy the report or open a prefilled GitHub issue.",
    content: view.element,
    size: "lg",
    autoFocus: true,
    className: "yapmod-bug-report-modal",
    onClose: () => view.dispose(),
    buttons: [
      {
        label: "Copy report",
        variant: "secondary",
        className: "small",
        closeOnClick: false,
        onClick: async () => {
          const copied = await copyText(
            buildBugReport(details, view.description()),
          );

          view.setStatus(
            copied
              ? "Report copied to your clipboard."
              : "Could not copy. Use Open GitHub issue instead.",
            copied ? "success" : "error",
          );

          return false;
        },
      },
      {
        label: "Open GitHub issue",
        className: "small",
        onClick: () => {
          openExternally(createIssueUrl(details, view.description()));
        },
      },
    ],
  });
}
