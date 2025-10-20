import { describe, expect, it } from "vitest";

import {
  deriveReleaseInfo,
  macArchitectureFromAssetName,
} from "@/lib/fetch-latest-release";
import { RELEASE_PAGE_URL } from "@/lib/releases";

describe("macArchitectureFromAssetName", () => {
  it("detects arm64 builds by suffix", () => {
    expect(macArchitectureFromAssetName("cmux-1.0.0-arm64.dmg")).toBe("arm64");
  });

  it("detects x64 builds with explicit marker", () => {
    expect(macArchitectureFromAssetName("cmux-1.0.0-x64.dmg")).toBe("x64");
    expect(
      macArchitectureFromAssetName("cmux-1.0.0-macos-intel-installer.dmg"),
    ).toBe("x64");
  });

  it("returns null for unsupported assets", () => {
    expect(macArchitectureFromAssetName("cmux-1.0.0.dmg.blockmap")).toBeNull();
    expect(macArchitectureFromAssetName("cmux-1.0.0-arm64.zip")).toBeNull();
  });
});

describe("deriveReleaseInfo", () => {
  it("extracts mac downloads including unlabeled dmg as x64", () => {
    const info = deriveReleaseInfo({
      tag_name: "v1.2.3",
      assets: [
        {
          name: "cmux-1.2.3-arm64.dmg",
          browser_download_url: "https://example.com/arm",
        },
        {
          name: "cmux-1.2.3.dmg",
          browser_download_url: "https://example.com/x64",
        },
      ],
    });

    expect(info.latestVersion).toBe("1.2.3");
    expect(info.macDownloadUrls.arm64).toBe("https://example.com/arm");
    expect(info.macDownloadUrls.x64).toBe("https://example.com/x64");
    expect(info.fallbackUrl).toBe(RELEASE_PAGE_URL);
  });

  it("handles releases without assets", () => {
    const info = deriveReleaseInfo({ tag_name: "v0.0.1" });

    expect(info.macDownloadUrls.arm64).toBeNull();
    expect(info.macDownloadUrls.x64).toBeNull();
    expect(info.fallbackUrl).toBe(RELEASE_PAGE_URL);
  });
});
