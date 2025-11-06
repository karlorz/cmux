import { api } from "@cmux/convex/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

export function useKeyboardShortcuts() {
  const params = useParams({ strict: false });
  const teamSlugOrId = (params as { teamSlugOrId?: string }).teamSlugOrId || "";

  const { data: shortcuts } = useQuery({
    ...convexQuery(api.keyboardShortcuts.get, { teamSlugOrId }),
    enabled: !!teamSlugOrId,
  });

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);

  return {
    shortcuts: shortcuts || {
      commandPaletteMac: "Cmd+K",
      commandPaletteOther: "Ctrl+K",
      sidebarToggle: "Ctrl+Shift+S",
      taskRunNavigationMac: "Ctrl",
      taskRunNavigationOther: "Alt",
      devToolsMac: "Cmd+I",
      devToolsOther: "Ctrl+I",
    },
    isMac,
    commandPalette: isMac
      ? (shortcuts?.commandPaletteMac || "Cmd+K")
      : (shortcuts?.commandPaletteOther || "Ctrl+K"),
    sidebarToggle: shortcuts?.sidebarToggle || "Ctrl+Shift+S",
    taskRunNavigation: isMac
      ? (shortcuts?.taskRunNavigationMac || "Ctrl")
      : (shortcuts?.taskRunNavigationOther || "Alt"),
    devTools: isMac
      ? (shortcuts?.devToolsMac || "Cmd+I")
      : (shortcuts?.devToolsOther || "Ctrl+I"),
  };
}
