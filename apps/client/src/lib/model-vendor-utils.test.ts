import { describe, expect, it } from "vitest";
import {
  getVendorOrder,
  getVendorDisplayName,
  groupModelsByVendor,
  sortModelsByVendor,
  VENDOR_DISPLAY_ORDER,
} from "./model-vendor-utils";

describe("getVendorOrder", () => {
  it("returns correct order for anthropic", () => {
    expect(getVendorOrder("anthropic")).toBe(0);
  });

  it("returns correct order for openai", () => {
    expect(getVendorOrder("openai")).toBe(1);
  });

  it("returns correct order for google", () => {
    expect(getVendorOrder("google")).toBe(4);
  });

  it("returns 99 for unknown vendor", () => {
    expect(getVendorOrder("unknown")).toBe(99);
  });

  it("returns 99 for empty string", () => {
    expect(getVendorOrder("")).toBe(99);
  });
});

describe("getVendorDisplayName", () => {
  it("returns 'Claude' for anthropic", () => {
    expect(getVendorDisplayName("anthropic")).toBe("Claude");
  });

  it("returns 'OpenAI / Codex' for openai", () => {
    expect(getVendorDisplayName("openai")).toBe("OpenAI / Codex");
  });

  it("returns 'Gemini' for google", () => {
    expect(getVendorDisplayName("google")).toBe("Gemini");
  });

  it("returns 'Other' for other", () => {
    expect(getVendorDisplayName("other")).toBe("Other");
  });

  it("capitalizes unknown vendor name", () => {
    expect(getVendorDisplayName("custom")).toBe("Custom");
  });

  it("handles empty string", () => {
    expect(getVendorDisplayName("")).toBe("");
  });
});

describe("groupModelsByVendor", () => {
  it("groups models by vendor", () => {
    const models = [
      { vendor: "anthropic", name: "claude-1" },
      { vendor: "openai", name: "gpt-1" },
      { vendor: "anthropic", name: "claude-2" },
    ];
    const grouped = groupModelsByVendor(models);
    expect(grouped.get("anthropic")).toHaveLength(2);
    expect(grouped.get("openai")).toHaveLength(1);
  });

  it("uses 'other' for models without vendor", () => {
    const models = [
      { vendor: "", name: "model-1" },
      { vendor: "anthropic", name: "model-2" },
    ];
    const grouped = groupModelsByVendor(models);
    expect(grouped.get("other")).toHaveLength(1);
  });

  it("preserves order within each vendor group", () => {
    const models = [
      { vendor: "anthropic", name: "first" },
      { vendor: "anthropic", name: "second" },
      { vendor: "anthropic", name: "third" },
    ];
    const grouped = groupModelsByVendor(models);
    const anthropic = grouped.get("anthropic")!;
    expect(anthropic.map((m) => m.name)).toEqual(["first", "second", "third"]);
  });

  it("sorts vendors by minimum sortOrder", () => {
    const models = [
      { vendor: "openai", name: "gpt", sortOrder: 10 },
      { vendor: "anthropic", name: "claude", sortOrder: 5 },
    ];
    const grouped = groupModelsByVendor(models);
    const vendors = [...grouped.keys()];
    expect(vendors[0]).toBe("anthropic");
    expect(vendors[1]).toBe("openai");
  });

  it("handles models without sortOrder", () => {
    const models = [
      { vendor: "openai", name: "gpt" },
      { vendor: "anthropic", name: "claude" },
    ];
    const grouped = groupModelsByVendor(models);
    expect(grouped.size).toBe(2);
  });

  it("returns empty map for empty input", () => {
    const grouped = groupModelsByVendor([]);
    expect(grouped.size).toBe(0);
  });
});

describe("sortModelsByVendor", () => {
  it("sorts by vendor order", () => {
    const models = [
      { vendor: "google", name: "gemini" },
      { vendor: "anthropic", name: "claude" },
      { vendor: "openai", name: "gpt" },
    ];
    const sorted = sortModelsByVendor(models);
    expect(sorted.map((m) => m.vendor)).toEqual([
      "anthropic",
      "openai",
      "google",
    ]);
  });

  it("uses secondary key for same vendor", () => {
    const models = [
      { vendor: "anthropic", name: "claude-3", order: 3 },
      { vendor: "anthropic", name: "claude-1", order: 1 },
      { vendor: "anthropic", name: "claude-2", order: 2 },
    ];
    const sorted = sortModelsByVendor(models, (m) => m.order);
    expect(sorted.map((m) => m.name)).toEqual([
      "claude-1",
      "claude-2",
      "claude-3",
    ]);
  });

  it("does not mutate original array", () => {
    const models = [{ vendor: "google" }, { vendor: "anthropic" }];
    const original = [...models];
    sortModelsByVendor(models);
    expect(models).toEqual(original);
  });

  it("handles empty array", () => {
    const sorted = sortModelsByVendor([]);
    expect(sorted).toEqual([]);
  });

  it("puts unknown vendors last", () => {
    const models = [
      { vendor: "unknown" },
      { vendor: "anthropic" },
    ];
    const sorted = sortModelsByVendor(models);
    expect(sorted[0].vendor).toBe("anthropic");
    expect(sorted[1].vendor).toBe("unknown");
  });
});

describe("VENDOR_DISPLAY_ORDER", () => {
  it("has anthropic as first vendor", () => {
    const minOrder = Math.min(
      ...Object.values(VENDOR_DISPLAY_ORDER).filter((v) => v !== 99)
    );
    expect(VENDOR_DISPLAY_ORDER.anthropic).toBe(minOrder);
  });

  it("has other as last vendor", () => {
    expect(VENDOR_DISPLAY_ORDER.other).toBe(99);
  });

  it("has unique order values (except other)", () => {
    const values = Object.entries(VENDOR_DISPLAY_ORDER)
      .filter(([k]) => k !== "other")
      .map(([, v]) => v);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});
