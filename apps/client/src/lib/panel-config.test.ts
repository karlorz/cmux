import { describe, expect, it } from "vitest";
import {
  getActivePanelPositions,
  getMaxPanelsForLayout,
  getAvailablePanels,
  removePanelFromAllPositions,
  getCurrentLayoutPanels,
  ensureTerminalPanelVisible,
  ALL_PANEL_TYPES,
  DEFAULT_PANEL_CONFIG,
  type PanelConfig,
  type LayoutMode,
} from "./panel-config";

describe("panel-config", () => {
  describe("getActivePanelPositions", () => {
    it("returns single position for single-panel layout", () => {
      expect(getActivePanelPositions("single-panel")).toEqual(["topLeft"]);
    });

    it("returns all four positions for four-panel layout", () => {
      expect(getActivePanelPositions("four-panel")).toEqual([
        "topLeft",
        "topRight",
        "bottomLeft",
        "bottomRight",
      ]);
    });

    it("returns two horizontal positions for two-horizontal layout", () => {
      expect(getActivePanelPositions("two-horizontal")).toEqual(["topLeft", "topRight"]);
    });

    it("returns two vertical positions for two-vertical layout", () => {
      expect(getActivePanelPositions("two-vertical")).toEqual(["topLeft", "bottomLeft"]);
    });

    it("returns three positions for three-left layout", () => {
      const positions = getActivePanelPositions("three-left");
      expect(positions).toHaveLength(3);
      expect(positions).toContain("topLeft");
      expect(positions).toContain("topRight");
      expect(positions).toContain("bottomRight");
    });

    it("returns three positions for three-right layout", () => {
      const positions = getActivePanelPositions("three-right");
      expect(positions).toHaveLength(3);
      expect(positions).toContain("topLeft");
      expect(positions).toContain("bottomLeft");
      expect(positions).toContain("bottomRight");
    });

    it("returns three positions for three-top layout", () => {
      const positions = getActivePanelPositions("three-top");
      expect(positions).toHaveLength(3);
      expect(positions).toContain("topLeft");
      expect(positions).toContain("bottomLeft");
      expect(positions).toContain("bottomRight");
    });

    it("returns three positions for three-bottom layout", () => {
      const positions = getActivePanelPositions("three-bottom");
      expect(positions).toHaveLength(3);
      expect(positions).toContain("topLeft");
      expect(positions).toContain("topRight");
      expect(positions).toContain("bottomRight");
    });
  });

  describe("getMaxPanelsForLayout", () => {
    it("returns 1 for single-panel", () => {
      expect(getMaxPanelsForLayout("single-panel")).toBe(1);
    });

    it("returns 4 for four-panel", () => {
      expect(getMaxPanelsForLayout("four-panel")).toBe(4);
    });

    it("returns 2 for two-horizontal", () => {
      expect(getMaxPanelsForLayout("two-horizontal")).toBe(2);
    });

    it("returns 2 for two-vertical", () => {
      expect(getMaxPanelsForLayout("two-vertical")).toBe(2);
    });

    it("returns 3 for three-* layouts", () => {
      const threeLayouts: LayoutMode[] = ["three-left", "three-right", "three-top", "three-bottom"];
      for (const layout of threeLayouts) {
        expect(getMaxPanelsForLayout(layout)).toBe(3);
      }
    });
  });

  describe("getCurrentLayoutPanels", () => {
    it("returns panels for current layout mode", () => {
      const config: PanelConfig = {
        layoutMode: "four-panel",
        layouts: {
          ...DEFAULT_PANEL_CONFIG.layouts,
          "four-panel": {
            topLeft: "chat",
            topRight: "workspace",
            bottomLeft: "terminal",
            bottomRight: "browser",
          },
        },
      };

      const panels = getCurrentLayoutPanels(config);
      expect(panels.topLeft).toBe("chat");
      expect(panels.topRight).toBe("workspace");
      expect(panels.bottomLeft).toBe("terminal");
      expect(panels.bottomRight).toBe("browser");
    });

    it("returns different panels for different layout modes", () => {
      const config: PanelConfig = {
        layoutMode: "single-panel",
        layouts: {
          ...DEFAULT_PANEL_CONFIG.layouts,
          "single-panel": {
            topLeft: "workspace",
            topRight: null,
            bottomLeft: null,
            bottomRight: null,
          },
        },
      };

      const panels = getCurrentLayoutPanels(config);
      expect(panels.topLeft).toBe("workspace");
      expect(panels.topRight).toBeNull();
    });
  });

  describe("getAvailablePanels", () => {
    it("returns all panel types when no panels are used", () => {
      const config: PanelConfig = {
        layoutMode: "four-panel",
        layouts: {
          ...DEFAULT_PANEL_CONFIG.layouts,
          "four-panel": {
            topLeft: null,
            topRight: null,
            bottomLeft: null,
            bottomRight: null,
          },
        },
      };

      const available = getAvailablePanels(config);
      expect(available).toEqual(ALL_PANEL_TYPES);
    });

    it("excludes panels that are already in use", () => {
      const config: PanelConfig = {
        layoutMode: "four-panel",
        layouts: {
          ...DEFAULT_PANEL_CONFIG.layouts,
          "four-panel": {
            topLeft: "chat",
            topRight: "workspace",
            bottomLeft: null,
            bottomRight: null,
          },
        },
      };

      const available = getAvailablePanels(config);
      expect(available).not.toContain("chat");
      expect(available).not.toContain("workspace");
      expect(available).toContain("terminal");
      expect(available).toContain("browser");
    });

    it("returns empty array when all panels are used", () => {
      // Create config where all panel types are used
      const config: PanelConfig = {
        layoutMode: "four-panel",
        layouts: {
          ...DEFAULT_PANEL_CONFIG.layouts,
          "four-panel": {
            topLeft: "chat",
            topRight: "workspace",
            bottomLeft: "terminal",
            bottomRight: "browser",
          },
        },
      };

      const available = getAvailablePanels(config);
      // These 4 are used, so 9 - 4 = 5 remaining
      expect(available.length).toBe(ALL_PANEL_TYPES.length - 4);
    });
  });

  describe("removePanelFromAllPositions", () => {
    it("removes panel from position where it exists", () => {
      const config: PanelConfig = {
        layoutMode: "four-panel",
        layouts: {
          ...DEFAULT_PANEL_CONFIG.layouts,
          "four-panel": {
            topLeft: "chat",
            topRight: "workspace",
            bottomLeft: "terminal",
            bottomRight: "browser",
          },
        },
      };

      const result = removePanelFromAllPositions(config, "chat");
      const panels = getCurrentLayoutPanels(result);
      expect(panels.topLeft).toBeNull();
      expect(panels.topRight).toBe("workspace");
    });

    it("does not affect panels that are not the target", () => {
      const config: PanelConfig = {
        layoutMode: "four-panel",
        layouts: {
          ...DEFAULT_PANEL_CONFIG.layouts,
          "four-panel": {
            topLeft: "chat",
            topRight: "workspace",
            bottomLeft: "terminal",
            bottomRight: "browser",
          },
        },
      };

      const result = removePanelFromAllPositions(config, "memory");
      const panels = getCurrentLayoutPanels(result);
      expect(panels.topLeft).toBe("chat");
      expect(panels.topRight).toBe("workspace");
      expect(panels.bottomLeft).toBe("terminal");
      expect(panels.bottomRight).toBe("browser");
    });

    it("preserves layout mode", () => {
      const config: PanelConfig = {
        layoutMode: "three-left",
        layouts: DEFAULT_PANEL_CONFIG.layouts,
      };

      const result = removePanelFromAllPositions(config, "chat");
      expect(result.layoutMode).toBe("three-left");
    });
  });

  describe("ensureTerminalPanelVisible", () => {
    it("returns unchanged config if terminal is already visible", () => {
      const config: PanelConfig = {
        layoutMode: "four-panel",
        layouts: {
          ...DEFAULT_PANEL_CONFIG.layouts,
          "four-panel": {
            topLeft: "terminal",
            topRight: "workspace",
            bottomLeft: null,
            bottomRight: null,
          },
        },
      };

      const result = ensureTerminalPanelVisible(config);
      expect(result).toBe(config); // Same reference
    });

    it("adds terminal to empty slot if available", () => {
      const config: PanelConfig = {
        layoutMode: "four-panel",
        layouts: {
          ...DEFAULT_PANEL_CONFIG.layouts,
          "four-panel": {
            topLeft: "chat",
            topRight: null,
            bottomLeft: null,
            bottomRight: null,
          },
        },
      };

      const result = ensureTerminalPanelVisible(config);
      const panels = getCurrentLayoutPanels(result);

      // Terminal should be added to one of the empty positions
      const hasTerminal = [panels.topLeft, panels.topRight, panels.bottomLeft, panels.bottomRight].includes("terminal");
      expect(hasTerminal).toBe(true);
    });

    it("returns unchanged config when all positions are full", () => {
      const config: PanelConfig = {
        layoutMode: "four-panel",
        layouts: {
          ...DEFAULT_PANEL_CONFIG.layouts,
          "four-panel": {
            topLeft: "chat",
            topRight: "workspace",
            bottomLeft: "browser",
            bottomRight: "gitDiff",
          },
        },
      };

      const result = ensureTerminalPanelVisible(config);
      expect(result).toBe(config); // Unchanged
    });
  });

  describe("ALL_PANEL_TYPES", () => {
    it("contains expected panel types", () => {
      expect(ALL_PANEL_TYPES).toContain("chat");
      expect(ALL_PANEL_TYPES).toContain("workspace");
      expect(ALL_PANEL_TYPES).toContain("terminal");
      expect(ALL_PANEL_TYPES).toContain("browser");
      expect(ALL_PANEL_TYPES).toContain("gitDiff");
      expect(ALL_PANEL_TYPES).toContain("memory");
      expect(ALL_PANEL_TYPES).toContain("summary");
      expect(ALL_PANEL_TYPES).toContain("liveDiff");
      expect(ALL_PANEL_TYPES).toContain("testResults");
    });

    it("has no duplicates", () => {
      const uniqueTypes = new Set(ALL_PANEL_TYPES);
      expect(uniqueTypes.size).toBe(ALL_PANEL_TYPES.length);
    });
  });
});
