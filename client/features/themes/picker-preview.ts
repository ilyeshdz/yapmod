import type { YapmodModal } from "../../shared/types";
import { getYapmod } from "../../core/scope";

/** Asks before a theme is deleted. */
export function confirmRemove(name: string): Promise<boolean> {
  const modalApi = getYapmod().modal;

  if (!modalApi) {
    return Promise.resolve(window.confirm(`Remove the theme "${name}"?`));
  }

  return new Promise<boolean>((resolve) => {
    modalApi.show({
      title: "Remove theme",
      description: `"${name}" will be deleted from your themes folder.`,
      buttons: [
        { label: "Cancel", variant: "secondary" },
        {
          label: "Remove",
          variant: "danger",
          onClick: (modal: YapmodModal) => {
            resolve(true);
            modal.close("button");
          },
        },
      ],
      onClose: () => resolve(false),
    });
  });
}
