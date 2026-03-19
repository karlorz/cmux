import { describe, expect, it } from "vitest";
import { aggregateByVendor } from "./providerStatus";
import type { ProviderStatus } from "@cmux/shared";

describe("aggregateByVendor", () => {
  it("returns empty array for empty input", () => {
    const result = aggregateByVendor([]);
    expect(result).toEqual([]);
  });

  it("groups agents by vendor using catalog lookup", () => {
    // Use exact agent names from the catalog
    const statuses: ProviderStatus[] = [
      { name: "claude/opus-4.5", isAvailable: true },
      { name: "claude/haiku-4.5", isAvailable: false },
    ];

    const result = aggregateByVendor(statuses);

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("anthropic");
    expect(result[0]?.agents).toHaveLength(2);
  });

  it("sets vendor as available if any agent is available", () => {
    const statuses: ProviderStatus[] = [
      { name: "claude/opus-4.5", isAvailable: false },
      { name: "claude/haiku-4.5", isAvailable: true },
    ];

    const result = aggregateByVendor(statuses);

    expect(result[0]?.isAvailable).toBe(true);
  });

  it("sets vendor as unavailable if all agents are unavailable", () => {
    const statuses: ProviderStatus[] = [
      { name: "claude/opus-4.5", isAvailable: false },
      { name: "claude/haiku-4.5", isAvailable: false },
    ];

    const result = aggregateByVendor(statuses);

    expect(result[0]?.isAvailable).toBe(false);
  });

  it("handles multiple vendors", () => {
    // Use exact agent names from the catalog
    const statuses: ProviderStatus[] = [
      { name: "claude/opus-4.5", isAvailable: true },
      { name: "codex/gpt-5.1-codex", isAvailable: true },
      { name: "gemini/2.5-flash", isAvailable: false },
    ];

    const result = aggregateByVendor(statuses);

    // Should have separate entries for each vendor
    const vendors = result.map((v) => v.name);
    expect(vendors).toContain("anthropic");
    expect(vendors).toContain("openai");
    expect(vendors).toContain("google");
  });

  it("preserves agent availability in agent list", () => {
    const statuses: ProviderStatus[] = [
      { name: "claude/opus-4.5", isAvailable: true },
      { name: "claude/haiku-4.5", isAvailable: false },
    ];

    const result = aggregateByVendor(statuses);

    const vendor = result[0];
    expect(vendor?.agents).toEqual([
      { name: "claude/opus-4.5", isAvailable: true },
      { name: "claude/haiku-4.5", isAvailable: false },
    ]);
  });

  it("assigns unknown vendor for unrecognized agents", () => {
    const statuses: ProviderStatus[] = [
      { name: "unknown-agent/model", isAvailable: true },
    ];

    const result = aggregateByVendor(statuses);

    expect(result[0]?.name).toBe("unknown");
  });
});
