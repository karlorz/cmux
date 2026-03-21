import { describe, expect, it } from "vitest";
import { resolveWwwInternalUrl } from "./server-env";

describe("resolveWwwInternalUrl", () => {
  it("prefers WWW_INTERNAL_URL when explicitly configured", () => {
    expect(
      resolveWwwInternalUrl({
        processWwwInternalUrl: "http://localhost:9779",
        processWwwOrigin: "https://public.example.test",
      }),
    ).toBe("http://localhost:9779");
  });

  it("falls back to the bundled public www origin when WWW_INTERNAL_URL is unset", () => {
    expect(
      resolveWwwInternalUrl({
        bundledWwwOrigin: "https://cmux-www.karldigi.dev",
      }),
    ).toBe("https://cmux-www.karldigi.dev");
  });
});
