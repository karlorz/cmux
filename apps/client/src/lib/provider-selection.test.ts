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
    // Use a non-codex model so version drift detection doesn't trigger
    const warnings = buildAgentSelectionWarnings({
      unavailableKnown: [],
      unknownMissing: ["claude/opus-4.5"],
      isWebMode: true,
    });

    expect(warnings.map((w) => w.kind)).toEqual(["unknownMissing"]);
    expect(warnings[0]?.message).not.toMatch(/API keys/i);
    expect(warnings[0]?.message).toMatch(/server/i);
  });

  it("shows unknownMissing for codex models when diagnostics show no version drift", () => {
    const warnings = buildAgentSelectionWarnings({
      unavailableKnown: [],
      unknownMissing: ["codex/gpt-5.3-codex"],
      isWebMode: true,
      diagnostics: {
        legacyCodexPresent: false,
        modelRegistryFingerprint: "v1-abc123",
      },
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

  it("shows version drift warning when legacyCodexPresent is true", () => {
    const warnings = buildAgentSelectionWarnings({
      unavailableKnown: [],
      unknownMissing: ["codex/gpt-5.3-codex"],
      isWebMode: true,
      diagnostics: {
        legacyCodexPresent: true,
        serverBuildId: "abc123",
      },
    });

    expect(warnings.map((w) => w.kind)).toEqual(["versionDrift"]);
    expect(warnings[0]?.message).toMatch(/older version/i);
    expect(warnings[0]?.message).toMatch(/abc123/);
  });

  it("shows specific Codex key message when codexKeyPresence shows no keys", () => {
    const warnings = buildAgentSelectionWarnings({
      unavailableKnown: ["codex/gpt-5.3-codex"],
      unknownMissing: [],
      isWebMode: true,
      diagnostics: {
        codexKeyPresence: {
          hasOpenaiApiKey: false,
          hasCodexAuthJson: false,
        },
      },
    });

    expect(warnings.map((w) => w.kind)).toEqual(["unavailableKnown"]);
    expect(warnings[0]?.message).toMatch(/OpenAI API Key or Codex Auth JSON/i);
  });

  it("shows generic message when keys are present but model still unavailable", () => {
    const warnings = buildAgentSelectionWarnings({
      unavailableKnown: ["codex/gpt-5.3-codex"],
      unknownMissing: [],
      isWebMode: true,
      diagnostics: {
        codexKeyPresence: {
          hasOpenaiApiKey: true,
          hasCodexAuthJson: false,
        },
      },
    });

    expect(warnings.map((w) => w.kind)).toEqual(["unavailableKnown"]);
    expect(warnings[0]?.message).not.toMatch(/OpenAI API Key or Codex Auth JSON/i);
    expect(warnings[0]?.message).toMatch(/Add your API keys/i);
  });
});

