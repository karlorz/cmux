import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

// Mock API keys returned by Convex - configured per test
let mockApiKeys: Record<string, string> = {};

vi.mock("./convexClient.js", () => ({
  getConvex: () => ({
    query: vi.fn().mockImplementation(() => Promise.resolve(mockApiKeys)),
  }),
}));

import {
  checkAllProvidersStatusWebMode,
  checkLegacyCodexPresent,
  computeModelRegistryFingerprint,
  getServerBuildId,
} from "./providerStatus";

describe("checkAllProvidersStatusWebMode", () => {
  beforeEach(() => {
    mockApiKeys = {};
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("with OPENAI_API_KEY present", () => {
    beforeEach(() => {
      mockApiKeys = { OPENAI_API_KEY: "sk-test" };
    });

    it("marks codex/gpt-5.3-codex* as available", async () => {
      const status = await checkAllProvidersStatusWebMode({
        teamSlugOrId: "team-1",
      });

      const codex = status.providers.find(
        (p) => p.name === "codex/gpt-5.3-codex"
      );
      expect(codex?.isAvailable).toBe(true);

      const codexHigh = status.providers.find(
        (p) => p.name === "codex/gpt-5.3-codex-high"
      );
      expect(codexHigh?.isAvailable).toBe(true);
    });

    it("marks codex/gpt-5.2-codex* as available", async () => {
      const status = await checkAllProvidersStatusWebMode({
        teamSlugOrId: "team-1",
      });

      const codex = status.providers.find(
        (p) => p.name === "codex/gpt-5.2-codex"
      );
      expect(codex?.isAvailable).toBe(true);

      const codexHigh = status.providers.find(
        (p) => p.name === "codex/gpt-5.2-codex-high"
      );
      expect(codexHigh?.isAvailable).toBe(true);
    });

    it("returns codexKeyPresence with hasOpenaiApiKey true", async () => {
      const status = await checkAllProvidersStatusWebMode({
        teamSlugOrId: "team-1",
      });

      expect(status.codexKeyPresence.hasOpenaiApiKey).toBe(true);
      expect(status.codexKeyPresence.hasCodexAuthJson).toBe(false);
    });
  });

  describe("with only CODEX_AUTH_JSON present", () => {
    beforeEach(() => {
      mockApiKeys = { CODEX_AUTH_JSON: '{"access_token":"test"}' };
    });

    it("marks codex/gpt-5.3-codex* as available", async () => {
      const status = await checkAllProvidersStatusWebMode({
        teamSlugOrId: "team-1",
      });

      const codex = status.providers.find(
        (p) => p.name === "codex/gpt-5.3-codex"
      );
      expect(codex?.isAvailable).toBe(true);
    });

    it("marks codex/gpt-5.2-codex* as available", async () => {
      const status = await checkAllProvidersStatusWebMode({
        teamSlugOrId: "team-1",
      });

      const codex = status.providers.find(
        (p) => p.name === "codex/gpt-5.2-codex"
      );
      expect(codex?.isAvailable).toBe(true);
    });

    it("returns codexKeyPresence with hasCodexAuthJson true", async () => {
      const status = await checkAllProvidersStatusWebMode({
        teamSlugOrId: "team-1",
      });

      expect(status.codexKeyPresence.hasOpenaiApiKey).toBe(false);
      expect(status.codexKeyPresence.hasCodexAuthJson).toBe(true);
    });
  });

  describe("with neither key present", () => {
    beforeEach(() => {
      mockApiKeys = {};
    });

    it("marks codex/gpt-5.3-codex* as unavailable", async () => {
      const status = await checkAllProvidersStatusWebMode({
        teamSlugOrId: "team-1",
      });

      const codex = status.providers.find(
        (p) => p.name === "codex/gpt-5.3-codex"
      );
      expect(codex?.isAvailable).toBe(false);
      expect(codex?.missingRequirements).toContain(
        "Codex Auth JSON or OpenAI API Key"
      );
    });

    it("marks codex/gpt-5.2-codex* as unavailable with same requirements", async () => {
      const status = await checkAllProvidersStatusWebMode({
        teamSlugOrId: "team-1",
      });

      const codex52 = status.providers.find(
        (p) => p.name === "codex/gpt-5.2-codex"
      );
      const codex53 = status.providers.find(
        (p) => p.name === "codex/gpt-5.3-codex"
      );

      expect(codex52?.isAvailable).toBe(false);
      expect(codex53?.isAvailable).toBe(false);
      expect(codex52?.missingRequirements).toEqual(codex53?.missingRequirements);
    });

    it("returns codexKeyPresence with both false", async () => {
      const status = await checkAllProvidersStatusWebMode({
        teamSlugOrId: "team-1",
      });

      expect(status.codexKeyPresence.hasOpenaiApiKey).toBe(false);
      expect(status.codexKeyPresence.hasCodexAuthJson).toBe(false);
    });
  });
});

describe("computeModelRegistryFingerprint", () => {
  it("returns a deterministic fingerprint", () => {
    const fp1 = computeModelRegistryFingerprint();
    const fp2 = computeModelRegistryFingerprint();
    expect(fp1).toBe(fp2);
  });

  it("returns a fingerprint starting with v1-", () => {
    const fp = computeModelRegistryFingerprint();
    expect(fp).toMatch(/^v1-/);
  });
});

describe("checkLegacyCodexPresent", () => {
  it("returns a boolean", () => {
    const result = checkLegacyCodexPresent();
    expect(typeof result).toBe("boolean");
  });
});

describe("getServerBuildId", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns undefined when no build ID env vars are set", () => {
    delete process.env.CMUX_BUILD_ID;
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.GIT_COMMIT_SHA;
    expect(getServerBuildId()).toBeUndefined();
  });

  it("returns CMUX_BUILD_ID when set", () => {
    process.env.CMUX_BUILD_ID = "build-123";
    expect(getServerBuildId()).toBe("build-123");
  });

  it("returns truncated VERCEL_GIT_COMMIT_SHA when CMUX_BUILD_ID not set", () => {
    delete process.env.CMUX_BUILD_ID;
    process.env.VERCEL_GIT_COMMIT_SHA = "abc123def456789012";
    expect(getServerBuildId()).toBe("abc123de");
  });
});

