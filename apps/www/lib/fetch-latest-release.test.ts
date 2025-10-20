import { describe, expect, it } from "vitest";

import { deriveReleaseInfo } from "./fetch-latest-release";

describe("deriveReleaseInfo", () => {
  it("maps architecture-specific dmg assets when both downloads are available", () => {
    const result = deriveReleaseInfo({
      tag_name: "v1.2.3",
      assets: [
        {
          name: "cmux-1.2.3-arm64.dmg",
          browser_download_url: "https://example.com/cmux-1.2.3-arm64.dmg",
        },
        {
          name: "cmux-1.2.3.dmg",
          browser_download_url: "https://example.com/cmux-1.2.3.dmg",
        },
      ],
    });

    expect(result.macDownloadUrls.arm64).toBe(
      "https://example.com/cmux-1.2.3-arm64.dmg",
    );
    expect(result.macDownloadUrls.x64).toBe(
      "https://example.com/cmux-1.2.3.dmg",
    );
    expect(result.latestVersion).toBe("1.2.3");
  });

  it("detects alternate x64 suffixes", () => {
    const result = deriveReleaseInfo({
      tag_name: "v2.0.0",
      assets: [
        {
          name: "cmux-2.0.0-arm64.dmg",
          browser_download_url: "https://example.com/cmux-2.0.0-arm64.dmg",
        },
        {
          name: "cmux-2.0.0-x64.dmg",
          browser_download_url: "https://example.com/cmux-2.0.0-x64.dmg",
        },
      ],
    });

    expect(result.macDownloadUrls.arm64).toBe(
      "https://example.com/cmux-2.0.0-arm64.dmg",
    );
    expect(result.macDownloadUrls.x64).toBe(
      "https://example.com/cmux-2.0.0-x64.dmg",
    );
  });

  it("falls back to the release page when assets are missing", () => {
    const result = deriveReleaseInfo(null);

    expect(result.macDownloadUrls.arm64).toBeNull();
    expect(result.macDownloadUrls.x64).toBeNull();
    expect(result.fallbackUrl).toContain("github.com/manaflow-ai/cmux/releases/latest");
    expect(result.latestVersion).toBeNull();
  });
});
