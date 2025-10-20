import { describe, expect, it } from "vitest";

import { RELEASE_PAGE_URL } from "@/lib/releases";
import { __releaseParsingInternals } from "./fetch-latest-release";

describe("inferArchitecturesFromAssetName", () => {
  const { inferArchitecturesFromAssetName } = __releaseParsingInternals;

  it("detects Apple silicon builds", () => {
    const result = inferArchitecturesFromAssetName("cmux-1.0.0-arm64.dmg");

    expect(result).toEqual({
      architectures: ["arm64"],
      confidence: 2,
    });
  });

  it("detects Intel builds without explicit suffix", () => {
    const result = inferArchitecturesFromAssetName("cmux-1.0.0.dmg");

    expect(result).toEqual({
      architectures: ["x64"],
      confidence: 0,
    });
  });

  it("detects universal builds", () => {
    const result = inferArchitecturesFromAssetName("cmux-1.0.0-universal.dmg");

    expect(result).toEqual({
      architectures: ["arm64", "x64"],
      confidence: 1,
    });
  });
});

describe("deriveReleaseInfo", () => {
  const { deriveReleaseInfo } = __releaseParsingInternals;

  it("extracts version and architecture URLs with suffixless Intel build", () => {
    const info = deriveReleaseInfo({
      tag_name: "v1.2.3",
      assets: [
        {
          name: "cmux-1.2.3-arm64.dmg",
          browser_download_url: "https://example.com/arm64",
        },
        {
          name: "cmux-1.2.3.dmg",
          browser_download_url: "https://example.com/x64",
        },
      ],
    });

    expect(info.latestVersion).toBe("1.2.3");
    expect(info.macDownloadUrls).toEqual({
      arm64: "https://example.com/arm64",
      x64: "https://example.com/x64",
    });
    expect(info.fallbackUrl).toBe(RELEASE_PAGE_URL);
  });

  it("prefers architecture-specific assets over universal candidates", () => {
    const info = deriveReleaseInfo({
      tag_name: "v1.2.3",
      assets: [
        {
          name: "cmux-1.2.3-universal.dmg",
          browser_download_url: "https://example.com/universal",
        },
        {
          name: "cmux-1.2.3-arm64.dmg",
          browser_download_url: "https://example.com/arm64",
        },
        {
          name: "cmux-1.2.3-x64.dmg",
          browser_download_url: "https://example.com/x64",
        },
      ],
    });

    expect(info.macDownloadUrls).toEqual({
      arm64: "https://example.com/arm64",
      x64: "https://example.com/x64",
    });
  });
});
