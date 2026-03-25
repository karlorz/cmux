import type { ProviderStatusResponse } from "@cmux/shared";
import { describe, expect, it, vi } from "vitest";

import {
  buildAggregatedVendorStatuses,
  getProviderStatusMeta,
  isAgentBlockedByProviderStatus,
} from "./provider-status-meta";

describe("provider-status-meta", () => {
  it("marks setup-needed vendors as unavailable for selection", () => {
    const providerStatus: ProviderStatusResponse = {
      success: true,
      providers: [
        {
          name: "qwen/qwen3-coder:free",
          isAvailable: false,
          missingRequirements: ["OpenRouter API Key"],
        },
      ],
    };

    const meta = getProviderStatusMeta(
      buildAggregatedVendorStatuses(providerStatus),
      "qwen",
      vi.fn(),
      true
    );

    expect(meta.statusTone).toBe("warning");
    expect(meta.statusLabel).toBe("Setup needed");
    expect(meta.isUnavailable).toBe(true);
    expect(meta.warning).toBeDefined();
    expect(isAgentBlockedByProviderStatus("qwen/qwen3-coder:free", providerStatus)).toBe(
      true
    );
  });

  it("keeps status-unavailable vendors selectable", () => {
    const providerStatus: ProviderStatusResponse = {
      success: true,
      providers: [],
    };

    const meta = getProviderStatusMeta(
      buildAggregatedVendorStatuses(providerStatus),
      "openai",
      vi.fn(),
      true
    );

    expect(meta.statusTone).toBe("warning");
    expect(meta.statusLabel).toBe("Status unavailable");
    expect(meta.isUnavailable).toBeUndefined();
    expect(isAgentBlockedByProviderStatus("codex/gpt-5.1", providerStatus)).toBe(
      false
    );
  });

  it("reports healthy vendors as ready", () => {
    const providerStatus: ProviderStatusResponse = {
      success: true,
      providers: [
        {
          name: "claude/sonnet-4.5",
          isAvailable: true,
        },
      ],
    };

    const meta = getProviderStatusMeta(
      buildAggregatedVendorStatuses(providerStatus),
      "anthropic",
      vi.fn(),
      true
    );

    expect(meta.statusTone).toBe("healthy");
    expect(meta.statusLabel).toBe("Ready");
    expect(meta.isUnavailable).toBeUndefined();
  });
});
