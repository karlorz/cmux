import { describe, expect, it } from "vitest";
import {
  OTHER_GROUP_KEY,
  groupItemsByProject,
  sortItems,
  filterRelevant,
  getGroupDisplayName,
} from "./sidebar-utils";
import type { ShowFilter } from "./sidebar-types";

describe("sidebar-utils", () => {
  describe("OTHER_GROUP_KEY", () => {
    it("is the expected string constant", () => {
      expect(OTHER_GROUP_KEY).toBe("__other__");
    });
  });

  describe("groupItemsByProject", () => {
    interface Item {
      id: number;
      project?: string;
    }

    const getProjectKey = (item: Item) => item.project;

    it("groups items by project key", () => {
      const items: Item[] = [
        { id: 1, project: "proj-a" },
        { id: 2, project: "proj-a" },
        { id: 3, project: "proj-b" },
      ];
      const result = groupItemsByProject(items, getProjectKey);

      expect(result.get("proj-a")).toEqual([
        { id: 1, project: "proj-a" },
        { id: 2, project: "proj-a" },
      ]);
      expect(result.get("proj-b")).toEqual([{ id: 3, project: "proj-b" }]);
    });

    it("puts items without group key in OTHER group", () => {
      const items: Item[] = [
        { id: 1, project: "proj-a" },
        { id: 2 },
        { id: 3, project: undefined },
      ];
      const result = groupItemsByProject(items, getProjectKey);

      expect(result.get(OTHER_GROUP_KEY)).toEqual([{ id: 2 }, { id: 3, project: undefined }]);
    });

    it("trims whitespace from group keys", () => {
      const items: Item[] = [
        { id: 1, project: "  proj-a  " },
        { id: 2, project: "proj-a" },
      ];
      const result = groupItemsByProject(items, getProjectKey);

      // Both items are grouped under the trimmed key
      const group = result.get("proj-a");
      expect(group).toHaveLength(2);
      expect(group).toEqual([
        { id: 1, project: "  proj-a  " },
        { id: 2, project: "proj-a" },
      ]);
      // Original untrimmed key should not exist
      expect(result.has("  proj-a  ")).toBe(false);
    });

    it("puts items with whitespace-only keys in OTHER group", () => {
      const items: Item[] = [
        { id: 1, project: "   " },
        { id: 2, project: "" },
      ];
      const result = groupItemsByProject(items, getProjectKey);

      expect(result.get(OTHER_GROUP_KEY)).toHaveLength(2);
    });

    it("returns empty map for empty input", () => {
      const result = groupItemsByProject([], getProjectKey);
      expect(result.size).toBe(0);
    });

    it("preserves item order within groups", () => {
      const items: Item[] = [
        { id: 1, project: "proj" },
        { id: 2, project: "proj" },
        { id: 3, project: "proj" },
      ];
      const result = groupItemsByProject(items, getProjectKey);
      const group = result.get("proj")!;

      expect(group[0].id).toBe(1);
      expect(group[1].id).toBe(2);
      expect(group[2].id).toBe(3);
    });

    it("does not create OTHER group when all items have keys", () => {
      const items: Item[] = [
        { id: 1, project: "proj-a" },
        { id: 2, project: "proj-b" },
      ];
      const result = groupItemsByProject(items, getProjectKey);

      expect(result.has(OTHER_GROUP_KEY)).toBe(false);
    });
  });

  describe("sortItems", () => {
    interface Item {
      id: number;
      timestamp: number;
    }

    it("sorts items in descending order by sort value", () => {
      const items: Item[] = [
        { id: 1, timestamp: 100 },
        { id: 2, timestamp: 300 },
        { id: 3, timestamp: 200 },
      ];
      const sorted = sortItems(items, (item) => item.timestamp);

      expect(sorted.map((i) => i.id)).toEqual([2, 3, 1]);
    });

    it("does not mutate original array", () => {
      const items: Item[] = [
        { id: 1, timestamp: 100 },
        { id: 2, timestamp: 300 },
      ];
      const original = [...items];
      sortItems(items, (item) => item.timestamp);

      expect(items).toEqual(original);
    });

    it("handles empty array", () => {
      const result = sortItems([], () => 0);
      expect(result).toEqual([]);
    });

    it("handles single item", () => {
      const items: Item[] = [{ id: 1, timestamp: 100 }];
      const result = sortItems(items, (item) => item.timestamp);
      expect(result).toEqual([{ id: 1, timestamp: 100 }]);
    });

    it("handles items with equal sort values", () => {
      const items: Item[] = [
        { id: 1, timestamp: 100 },
        { id: 2, timestamp: 100 },
        { id: 3, timestamp: 100 },
      ];
      const result = sortItems(items, (item) => item.timestamp);
      expect(result).toHaveLength(3);
    });

    it("handles negative sort values", () => {
      const items: Item[] = [
        { id: 1, timestamp: -100 },
        { id: 2, timestamp: 50 },
        { id: 3, timestamp: -200 },
      ];
      const sorted = sortItems(items, (item) => item.timestamp);

      expect(sorted.map((i) => i.id)).toEqual([2, 1, 3]);
    });
  });

  describe("filterRelevant", () => {
    interface Item {
      id: number;
      active: boolean;
    }

    const isRelevant = (item: Item) => item.active;

    it("returns all items when showFilter is 'all'", () => {
      const items: Item[] = [
        { id: 1, active: true },
        { id: 2, active: false },
        { id: 3, active: true },
      ];
      const result = filterRelevant(items, "all", isRelevant);

      expect(result).toEqual(items);
    });

    it("filters to relevant items when showFilter is 'relevant'", () => {
      const items: Item[] = [
        { id: 1, active: true },
        { id: 2, active: false },
        { id: 3, active: true },
      ];
      const result = filterRelevant(items, "relevant" as ShowFilter, isRelevant);

      expect(result).toEqual([
        { id: 1, active: true },
        { id: 3, active: true },
      ]);
    });

    it("returns empty array when no items are relevant", () => {
      const items: Item[] = [
        { id: 1, active: false },
        { id: 2, active: false },
      ];
      const result = filterRelevant(items, "relevant" as ShowFilter, isRelevant);

      expect(result).toEqual([]);
    });

    it("handles empty input array", () => {
      const result = filterRelevant([], "relevant" as ShowFilter, isRelevant);
      expect(result).toEqual([]);
    });

    it("returns all items when all are relevant", () => {
      const items: Item[] = [
        { id: 1, active: true },
        { id: 2, active: true },
      ];
      const result = filterRelevant(items, "relevant" as ShowFilter, isRelevant);

      expect(result).toEqual(items);
    });
  });

  describe("getGroupDisplayName", () => {
    it("returns 'Other' for OTHER_GROUP_KEY", () => {
      expect(getGroupDisplayName(OTHER_GROUP_KEY)).toBe("Other");
    });

    it("returns 'Other' for __other__ directly", () => {
      expect(getGroupDisplayName("__other__")).toBe("Other");
    });

    it("extracts repo name from owner/repo format", () => {
      expect(getGroupDisplayName("acme/my-project")).toBe("my-project");
    });

    it("returns full key when no slash present", () => {
      expect(getGroupDisplayName("my-project")).toBe("my-project");
    });

    it("handles empty string", () => {
      expect(getGroupDisplayName("")).toBe("");
    });

    it("handles key with multiple slashes", () => {
      // Only splits on first slash, takes second part
      expect(getGroupDisplayName("org/repo/subfolder")).toBe("repo");
    });

    it("handles key ending with slash (falls back to full key)", () => {
      // Empty repo portion falls back to groupKey
      expect(getGroupDisplayName("org/")).toBe("org/");
    });

    it("handles key starting with slash", () => {
      expect(getGroupDisplayName("/repo")).toBe("repo");
    });
  });
});
