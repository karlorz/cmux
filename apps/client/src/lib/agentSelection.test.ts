import { describe, expect, it } from "vitest";
import { reconcileAgentSelection } from "./agentSelection";

describe("reconcileAgentSelection", () => {
  it("classifies missing provider entries as unknownMissing", () => {
    const result = reconcileAgentSelection(["codex/gpt-5.3-codex"], [
      { name: "claude/opus-4.5", isAvailable: true },
    ]);

    expect(result.removedUnknownMissing).toEqual(["codex/gpt-5.3-codex"]);
    expect(result.removedUnavailableKnown).toEqual([]);
    expect(result.removedUnknownClient).toEqual([]);
  });

  it("classifies unavailable providers as unavailableKnown", () => {
    const result = reconcileAgentSelection(["codex/gpt-5.3-codex"], [
      { name: "codex/gpt-5.3-codex", isAvailable: false },
    ]);

    expect(result.removedUnavailableKnown).toEqual(["codex/gpt-5.3-codex"]);
    expect(result.removedUnknownMissing).toEqual([]);
    expect(result.removedUnknownClient).toEqual([]);
  });
});
