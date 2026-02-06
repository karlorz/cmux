import { describe, expect, it, vi } from "vitest";

// Quiet logger output during tests
vi.mock("./fileLogger.js", () => ({
  serverLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    close: vi.fn(),
  },
  dockerLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    close: vi.fn(),
  },
}));

vi.mock("./convexClient.js", () => ({
  getConvex: () => ({
    query: vi.fn().mockResolvedValue({
      OPENAI_API_KEY: "sk-test",
    }),
  }),
}));

import { checkAllProvidersStatusWebMode } from "./providerStatus";

describe("checkAllProvidersStatusWebMode", () => {
  it("marks codex/gpt-5.3-codex* as available when OPENAI_API_KEY is present", async () => {
    const status = await checkAllProvidersStatusWebMode({
      teamSlugOrId: "team-1",
    });

    const codex = status.providers.find((p) => p.name === "codex/gpt-5.3-codex");
    expect(codex?.isAvailable).toBe(true);

    const codexHigh = status.providers.find(
      (p) => p.name === "codex/gpt-5.3-codex-high"
    );
    expect(codexHigh?.isAvailable).toBe(true);
  });
});

