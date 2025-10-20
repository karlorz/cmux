import { describe, expect, it } from "vitest";

import { resolveMacDownloadUrl } from "./mac-download-link";
import type { MacDownloadUrls } from "../lib/releases";

describe("resolveMacDownloadUrl", () => {
  const fallbackUrl = "https://example.com/releases";

  it("returns the requested architecture when available", () => {
    const urls: MacDownloadUrls = {
      arm64: "https://example.com/arm64.dmg",
      x64: "https://example.com/x64.dmg",
    };

    expect(resolveMacDownloadUrl(urls, "arm64", fallbackUrl)).toBe(
      "https://example.com/arm64.dmg",
    );
  });

  it("falls back to the alternate architecture when the requested build is missing", () => {
    const urls: MacDownloadUrls = {
      arm64: "https://example.com/arm64.dmg",
      x64: null,
    };

    expect(resolveMacDownloadUrl(urls, "x64", fallbackUrl)).toBe(
      "https://example.com/arm64.dmg",
    );
  });

  it("returns the release page when no builds are available", () => {
    const urls: MacDownloadUrls = {
      arm64: null,
      x64: null,
    };

    expect(resolveMacDownloadUrl(urls, "arm64", fallbackUrl)).toBe(fallbackUrl);
  });
});
