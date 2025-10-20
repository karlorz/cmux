import { describe, expect, it } from "vitest";

import { deriveReleaseInfo } from "./fetch-latest-release";
import { RELEASE_PAGE_URL } from "./releases";

describe("deriveReleaseInfo", () => {
  it("extracts mac download urls using asset labels when names are ambiguous", () => {
    const info = deriveReleaseInfo({
      tag_name: "v1.2.3",
      assets: [
        {
          name: "cmux-1.2.3-arm64.dmg",
          browser_download_url: "https://example.com/arm64.dmg",
        },
        {
          name: "cmux-1.2.3.dmg",
          label: "cmux-1.2.3-x64.dmg",
          browser_download_url: "https://example.com/x64.dmg",
        },
      ],
    });

    expect(info.latestVersion).toBe("1.2.3");
    expect(info.macDownloadUrls.arm64).toBe("https://example.com/arm64.dmg");
    expect(info.macDownloadUrls.x64).toBe("https://example.com/x64.dmg");
    expect(info.fallbackUrl).toBe(RELEASE_PAGE_URL);
  });

  it("defaults to x64 for bare dmg assets when no label is present", () => {
    const info = deriveReleaseInfo({
      tag_name: "v9.9.9",
      assets: [
        {
          name: "cmux-9.9.9.dmg",
          browser_download_url: "https://example.com/x64.dmg",
        },
      ],
    });

    expect(info.latestVersion).toBe("9.9.9");
    expect(info.macDownloadUrls.x64).toBe("https://example.com/x64.dmg");
  });
});
