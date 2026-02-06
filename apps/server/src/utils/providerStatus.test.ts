import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkAllProvidersStatusWebMode } from "./providerStatus";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock("./convexClient.js", () => ({
  getConvex: () => ({
    query: queryMock,
  }),
}));

vi.mock("./fileLogger.js", () => ({
  serverLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("checkAllProvidersStatusWebMode", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("marks codex/gpt-5.3-codex as available when OpenAI API key is present", async () => {
    queryMock.mockResolvedValue({
      OPENAI_API_KEY: "sk-test",
    });

    const result = await checkAllProvidersStatusWebMode({
      teamSlugOrId: "team-123",
    });

    const codex53 = result.providers.find(
      (provider) => provider.name === "codex/gpt-5.3-codex"
    );

    expect(codex53).toBeDefined();
    expect(codex53?.isAvailable).toBe(true);
  });
});
