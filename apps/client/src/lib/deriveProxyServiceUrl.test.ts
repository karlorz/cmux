import { describe, expect, it } from "vitest";
import { buildProxyOrigin, parseProxyHostname } from "./deriveProxyServiceUrl";

describe("parseProxyHostname", () => {
  it("parses PVE LXC proxy hostnames", () => {
    expect(
      parseProxyHostname("port-5173-pvelxc-30b1cc26.alphasolves.com"),
    ).toEqual({
      currentPort: 5173,
      hostId: "pvelxc-30b1cc26",
      domain: "alphasolves.com",
    });
  });

  it("parses Morph proxy hostnames", () => {
    expect(
      parseProxyHostname("port-5173-morphvm-abc123.http.cloud.morph.so"),
    ).toEqual({
      currentPort: 5173,
      hostId: "morphvm-abc123",
      domain: "http.cloud.morph.so",
    });
  });

  it("returns null for non-proxy hostnames", () => {
    expect(parseProxyHostname("localhost")).toBeNull();
    expect(parseProxyHostname("www.cmux.sh")).toBeNull();
  });
});

describe("buildProxyOrigin", () => {
  it("builds a target proxy origin from parsed components", () => {
    expect(
      buildProxyOrigin(
        { hostId: "pvelxc-30b1cc26", domain: "alphasolves.com" },
        9779,
      ),
    ).toBe("https://port-9779-pvelxc-30b1cc26.alphasolves.com");
  });
});
