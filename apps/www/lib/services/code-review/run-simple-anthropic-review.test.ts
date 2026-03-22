import { beforeEach, describe, expect, it, vi } from "vitest";

const streamTextMock = vi.fn();
const anthropicCreateMock = vi.fn();

vi.mock("ai", () => ({
  streamText: (...args: unknown[]) => streamTextMock(...args),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: ({ apiKey, baseURL }: { apiKey: string; baseURL: string }) => {
    anthropicCreateMock({ apiKey, baseURL });
    return (modelId: string) => ({
      provider: "anthropic",
      apiKey,
      baseURL,
      modelId,
    });
  },
}));

vi.mock("@/scripts/pr-review-heatmap", () => ({
  collectPrDiffs: vi.fn(),
  collectPrDiffsViaGhCli: vi.fn(),
}));

vi.mock("@/lib/utils/github-app-token", () => ({
  generateGitHubInstallationToken: vi.fn(),
  getInstallationForRepo: vi.fn(),
}));

vi.mock("@/lib/github/check-repo-visibility", () => ({
  checkRepoVisibility: vi.fn(),
}));

describe("runSimpleAnthropicReviewStream", () => {
  beforeEach(() => {
    streamTextMock.mockReset();
    anthropicCreateMock.mockReset();
  });

  it("uses Bedrock-backed Anthropic proxy resolution instead of failing early on missing ANTHROPIC_API_KEY", async () => {
    vi.resetModules();

    vi.doMock("@/lib/utils/www-env", () => ({
      env: {
        NEXT_PUBLIC_CONVEX_URL: "https://review-test.convex.cloud",
        CONVEX_SITE_URL: undefined,
        OPENAI_API_KEY: undefined,
        GEMINI_API_KEY: undefined,
        ANTHROPIC_API_KEY: undefined,
        AWS_BEARER_TOKEN_BEDROCK: "bedrock-token",
      },
    }));

    const { runSimpleAnthropicReviewStream } = await import("./run-simple-anthropic-review");

    streamTextMock.mockImplementation(() => {
      expect(anthropicCreateMock).toHaveBeenCalledWith({
        apiKey: "sk_placeholder_cmux_anthropic_api_key",
        baseURL: "https://review-test.convex.site/api/anthropic/v1",
      });

      return {
        textStream: (async function* () {
          yield [
            "diff --git a/src/example.ts b/src/example.ts",
            "--- a/src/example.ts",
            "+++ b/src/example.ts",
            "@@ -1 +1 @@",
            '+const value = 1; # "value" "new logic added" "42"',
            "",
          ].join("\n");
        })(),
      };
    });

    const result = await runSimpleAnthropicReviewStream({
      prIdentifier: "owner/repo#123",
      fileDiffs: [
        {
          filePath: "src/example.ts",
          diffText: [
            "diff --git a/src/example.ts b/src/example.ts",
            "--- a/src/example.ts",
            "+++ b/src/example.ts",
            "@@ -1 +1 @@",
            "+const value = 1;",
            "",
          ].join("\n"),
        },
      ],
      onEvent: vi.fn(),
    });

    expect(streamTextMock).toHaveBeenCalledTimes(1);
    expect(result.diffCharacterCount).toBeGreaterThan(0);
    expect(result.finalText).toContain('new logic added');
  });
});
