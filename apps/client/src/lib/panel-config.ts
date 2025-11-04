export type PanelType = "chat" | "workspace" | "terminal" | "browser" | "gitDiff";

export type LayoutMode =
  | "four-panel"      // 2x2 grid
  | "two-horizontal"  // Two panels side-by-side
  | "two-vertical"    // Two panels stacked
  | "three-left"      // One large panel on left, two stacked on right
  | "three-right"     // Two stacked on left, one large panel on right
  | "three-top"       // One large panel on top, two side-by-side on bottom
  | "three-bottom";   // Two side-by-side on top, one large panel on bottom

export interface PanelConfig {
  layoutMode: LayoutMode;
  topLeft: PanelType | null;
  topRight: PanelType | null;
  bottomLeft: PanelType | null;
  bottomRight: PanelType | null;
}

export const DEFAULT_PANEL_CONFIG: PanelConfig = {
  layoutMode: "four-panel",
  topLeft: "chat",
  topRight: "workspace",
  bottomLeft: "terminal",
  bottomRight: "browser",
};

export const PANEL_LABELS: Record<PanelType, string> = {
  chat: "Activity",
  workspace: "Workspace",
  terminal: "Terminal",
  browser: "Browser",
  gitDiff: "Git Diff",
};

export const PANEL_ICONS: Record<PanelType, string> = {
  chat: "MessageSquare",
  workspace: "Code2",
  terminal: "TerminalSquare",
  browser: "Globe2",
  gitDiff: "GitCompare",
};

export const LAYOUT_LABELS: Record<LayoutMode, string> = {
  "four-panel": "Four Panel Grid",
  "two-horizontal": "Two Panels (Side-by-Side)",
  "two-vertical": "Two Panels (Stacked)",
  "three-left": "Three Panels (Large Left)",
  "three-right": "Three Panels (Large Right)",
  "three-top": "Three Panels (Large Top)",
  "three-bottom": "Three Panels (Large Bottom)",
};

export const LAYOUT_DESCRIPTIONS: Record<LayoutMode, string> = {
  "four-panel": "2×2 grid with four equal panels",
  "two-horizontal": "Two panels side-by-side",
  "two-vertical": "Two panels stacked vertically",
  "three-left": "One large panel on left, two stacked on right",
  "three-right": "Two stacked panels on left, one large on right",
  "three-top": "One large panel on top, two side-by-side below",
  "three-bottom": "Two panels side-by-side on top, one large below",
};

const STORAGE_KEY = "taskPanelConfig";

export function loadPanelConfig(): PanelConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        layoutMode: parsed.layoutMode ?? DEFAULT_PANEL_CONFIG.layoutMode,
        topLeft: parsed.topLeft ?? DEFAULT_PANEL_CONFIG.topLeft,
        topRight: parsed.topRight ?? DEFAULT_PANEL_CONFIG.topRight,
        bottomLeft: parsed.bottomLeft ?? DEFAULT_PANEL_CONFIG.bottomLeft,
        bottomRight: parsed.bottomRight ?? DEFAULT_PANEL_CONFIG.bottomRight,
      };
    }
  } catch (error) {
    console.error("Failed to load panel config:", error);
  }
  return DEFAULT_PANEL_CONFIG;
}

export function savePanelConfig(config: PanelConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.error("Failed to save panel config:", error);
  }
}

export function resetPanelConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("Failed to reset panel config:", error);
  }
}

export function getAvailablePanels(config: PanelConfig): PanelType[] {
  const allPanels: PanelType[] = ["chat", "workspace", "terminal", "browser", "gitDiff"];
  const usedPanels = new Set([
    config.topLeft,
    config.topRight,
    config.bottomLeft,
    config.bottomRight,
  ].filter((p): p is PanelType => p !== null));

  return allPanels.filter(panel => !usedPanels.has(panel));
}

export type PanelPosition = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

/**
 * Returns which panel positions are visible for the given layout mode
 */
export function getActivePanelPositions(layoutMode: LayoutMode): PanelPosition[] {
  switch (layoutMode) {
    case "four-panel":
      return ["topLeft", "topRight", "bottomLeft", "bottomRight"];
    case "two-horizontal":
      return ["topLeft", "topRight"];
    case "two-vertical":
      return ["topLeft", "bottomLeft"];
    case "three-left":
      return ["topLeft", "topRight", "bottomRight"];
    case "three-right":
      return ["topLeft", "bottomLeft", "bottomRight"];
    case "three-top":
      return ["topLeft", "bottomLeft", "bottomRight"];
    case "three-bottom":
      return ["topLeft", "topRight", "bottomRight"];
  }
}

/**
 * Returns the maximum number of panels for a layout mode
 */
export function getMaxPanelsForLayout(layoutMode: LayoutMode): number {
  return getActivePanelPositions(layoutMode).length;
}
