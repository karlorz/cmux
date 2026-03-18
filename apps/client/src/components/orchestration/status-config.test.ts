import { describe, expect, it } from "vitest";
import { STATUS_CONFIG, STATUS_GRAPH_COLORS, type TaskStatus } from "./status-config";

const ALL_STATUSES: TaskStatus[] = ["pending", "assigned", "running", "completed", "failed", "cancelled"];

describe("STATUS_CONFIG", () => {
  it("has entries for all task statuses", () => {
    for (const status of ALL_STATUSES) {
      expect(STATUS_CONFIG[status]).toBeDefined();
      expect(STATUS_CONFIG[status].label).toBeTruthy();
      expect(STATUS_CONFIG[status].color).toBeTruthy();
      expect(STATUS_CONFIG[status].bgColor).toBeTruthy();
      expect(STATUS_CONFIG[status].icon).toBeTruthy();
    }
  });

  it("has no extra statuses beyond the expected set", () => {
    const configKeys = Object.keys(STATUS_CONFIG);
    expect(configKeys).toHaveLength(ALL_STATUSES.length);
    for (const key of configKeys) {
      expect(ALL_STATUSES).toContain(key);
    }
  });

  it("uses tailwind text color classes", () => {
    for (const status of ALL_STATUSES) {
      expect(STATUS_CONFIG[status].color).toMatch(/^text-/);
    }
  });
});

describe("STATUS_GRAPH_COLORS", () => {
  it("has entries for all task statuses", () => {
    for (const status of ALL_STATUSES) {
      expect(STATUS_GRAPH_COLORS[status]).toBeDefined();
      expect(STATUS_GRAPH_COLORS[status].bg).toBeTruthy();
      expect(STATUS_GRAPH_COLORS[status].border).toBeTruthy();
      expect(STATUS_GRAPH_COLORS[status].dot).toBeTruthy();
    }
  });

  it("uses tailwind bg classes for backgrounds", () => {
    for (const status of ALL_STATUSES) {
      expect(STATUS_GRAPH_COLORS[status].bg).toMatch(/^bg-/);
      expect(STATUS_GRAPH_COLORS[status].dot).toMatch(/^bg-/);
      expect(STATUS_GRAPH_COLORS[status].border).toMatch(/^border-/);
    }
  });

  it("includes dark mode variants", () => {
    for (const status of ALL_STATUSES) {
      expect(STATUS_GRAPH_COLORS[status].bg).toMatch(/dark:/);
      expect(STATUS_GRAPH_COLORS[status].border).toMatch(/dark:/);
    }
  });

  it("has animate-pulse only on running status dot", () => {
    expect(STATUS_GRAPH_COLORS.running.dot).toContain("animate-pulse");
    for (const status of ALL_STATUSES.filter((s) => s !== "running")) {
      expect(STATUS_GRAPH_COLORS[status].dot).not.toContain("animate-pulse");
    }
  });
});
