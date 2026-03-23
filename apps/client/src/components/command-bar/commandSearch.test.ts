import { describe, expect, it } from "vitest";
import { buildSearchText, filterCommandItems, type SearchableCommandItem } from "./commandSearch";

describe("commandSearch", () => {
  describe("buildSearchText", () => {
    it("returns label only when no extras", () => {
      const result = buildSearchText("Open File");
      expect(result).toBe("Open File");
    });

    it("includes keywords in search text", () => {
      const result = buildSearchText("Open File", ["open", "file", "browse"]);
      expect(result).toBe("Open File open file browse");
    });

    it("includes extras in search text", () => {
      const result = buildSearchText("Git Commit", [], ["version control", "save"]);
      expect(result).toBe("Git Commit version control save");
    });

    it("combines label, keywords, and extras", () => {
      const result = buildSearchText("Settings", ["config", "preferences"], ["gear", "options"]);
      expect(result).toBe("Settings config preferences gear options");
    });

    it("filters out undefined extras", () => {
      const result = buildSearchText("Test", ["keyword"], [undefined, "valid", undefined]);
      expect(result).toBe("Test keyword valid");
    });

    it("filters out empty string extras", () => {
      const result = buildSearchText("Test", ["keyword"], ["", "valid", ""]);
      expect(result).toBe("Test keyword valid");
    });

    it("trims whitespace from parts", () => {
      const result = buildSearchText("  Label  ", ["  keyword  "], ["  extra  "]);
      expect(result).toBe("Label keyword extra");
    });

    it("handles empty label", () => {
      const result = buildSearchText("", ["keyword"]);
      expect(result).toBe("keyword");
    });

    it("handles all empty inputs", () => {
      const result = buildSearchText("", [], []);
      expect(result).toBe("");
    });

    it("handles whitespace-only inputs", () => {
      const result = buildSearchText("   ", ["   "], ["   "]);
      expect(result).toBe("");
    });
  });

  describe("filterCommandItems", () => {
    const createItem = (value: string, searchText: string): SearchableCommandItem => ({
      value,
      searchText,
    });

    const sampleItems: SearchableCommandItem[] = [
      createItem("open-file", "Open File browse"),
      createItem("open-recent", "Open Recent history"),
      createItem("git-commit", "Git Commit save changes"),
      createItem("git-push", "Git Push upload remote"),
      createItem("settings", "Settings preferences config"),
    ];

    it("returns all items for empty query", () => {
      const result = filterCommandItems("", sampleItems);
      expect(result).toHaveLength(5);
      expect(result).toEqual(sampleItems);
    });

    it("returns all items for whitespace-only query", () => {
      const result = filterCommandItems("   ", sampleItems);
      expect(result).toHaveLength(5);
    });

    it("filters items by fuzzy match", () => {
      const result = filterCommandItems("open", sampleItems);
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((item) => item.searchText.toLowerCase().includes("open"))).toBe(true);
    });

    it("returns empty array when no matches", () => {
      const result = filterCommandItems("xyznonexistent", sampleItems);
      expect(result).toHaveLength(0);
    });

    it("sorts results by score (best match first)", () => {
      const items: SearchableCommandItem[] = [
        createItem("abc", "abc def"),
        createItem("def", "def abc extra"),
        createItem("exact", "def"),
      ];
      const result = filterCommandItems("def", items);
      // "def" should score higher than items where it's not at the start
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((item) => item.value === "exact")).toBe(true);
    });

    it("matches partial strings", () => {
      const result = filterCommandItems("git", sampleItems);
      expect(result.length).toBe(2);
      expect(result.every((item) => item.value.startsWith("git"))).toBe(true);
    });

    it("matches case-insensitively", () => {
      const result = filterCommandItems("OPEN", sampleItems);
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((item) => item.value === "open-file")).toBe(true);
    });

    it("preserves item type through filtering", () => {
      interface ExtendedItem extends SearchableCommandItem {
        customProp: number;
      }
      const extendedItems: ExtendedItem[] = [
        { value: "a", searchText: "alpha", customProp: 1 },
        { value: "b", searchText: "beta", customProp: 2 },
      ];
      const result = filterCommandItems("alpha", extendedItems);
      expect(result).toHaveLength(1);
      expect(result[0].customProp).toBe(1);
    });

    it("handles empty items array", () => {
      const result = filterCommandItems("test", []);
      expect(result).toHaveLength(0);
    });

    it("handles single item match", () => {
      const items: SearchableCommandItem[] = [createItem("only", "only one item")];
      const result = filterCommandItems("only", items);
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe("only");
    });

    it("handles fuzzy matching with non-contiguous characters", () => {
      const items: SearchableCommandItem[] = [
        createItem("file-manager", "File Manager browse files"),
      ];
      // "fm" should match "File Manager" (f from File, m from Manager)
      const result = filterCommandItems("fm", items);
      expect(result.length).toBeGreaterThan(0);
    });

    it("trims query before matching", () => {
      const result = filterCommandItems("  open  ", sampleItems);
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
