import { describe, expect, it } from "vitest";
import {
  buildAgentSelectionWarnings,
  pruneKnownAgentsByProviderStatus,
} from "./provider-selection";

describe("pruneKnownAgentsByProviderStatus", () => {
  it("classifies missing provider entries as unknownMissing", () => {
    const result = pruneKnownAgentsByProviderStatus({
      agents: ["codex/gpt-5.3-codex"],
      providers: [{ name: "codex/gpt-5.2-codex", isAvailable: true }],
    });

    expect(result.filteredAgents).toEqual([]);
    expect(result.unavailableKnown).toEqual([]);
    expect(result.unknownMissing).toEqual(["codex/gpt-5.3-codex"]);
  });

  it("classifies known-but-unavailable entries as unavailableKnown", () => {
    const result = pruneKnownAgentsByProviderStatus({
      agents: ["codex/gpt-5.3-codex"],
      providers: [{ name: "codex/gpt-5.3-codex", isAvailable: false }],
    });

    expect(result.filteredAgents).toEqual([]);
    expect(result.unavailableKnown).toEqual(["codex/gpt-5.3-codex"]);
    expect(result.unknownMissing).toEqual([]);
  });
});

describe("buildAgentSelectionWarnings", () => {
  it("does not show an API-key message for unknownMissing", () => {
    const warnings = buildAgentSelectionWarnings({
      unavailableKnown: [],
      unknownMissing: ["codex/gpt-5.3-codex"],
      isWebMode: true,
    });

    expect(warnings.map((w) => w.kind)).toEqual(["unknownMissing"]);
    expect(warnings[0]?.message).not.toMatch(/API keys/i);
    expect(warnings[0]?.message).toMatch(/server/i);
  });

  it("shows an API-key message for unavailableKnown in web mode", () => {
    const warnings = buildAgentSelectionWarnings({
      unavailableKnown: ["codex/gpt-5.3-codex"],
      unknownMissing: [],
      isWebMode: true,
    });

    expect(warnings.map((w) => w.kind)).toEqual(["unavailableKnown"]);
    expect(warnings[0]?.message).toMatch(/Add your API keys/i);
  });
});

