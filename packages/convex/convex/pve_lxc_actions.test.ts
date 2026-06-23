import { describe, expect, test } from "vitest";

import { vncUrlWithToken } from "./pve_lxc_actions";

describe("vncUrlWithToken", () => {
  test("adds the VNC token query parameter to a base URL", () => {
    expect(vncUrlWithToken("https://port-39380-pvelxc-abc.example.com", "token-123")).toBe(
      "https://port-39380-pvelxc-abc.example.com/?tkn=token-123"
    );
  });

  test("preserves path and unrelated query parameters", () => {
    expect(
      vncUrlWithToken(
        "https://port-39380-pvelxc-abc.example.com/vnc.html?autoconnect=1&resize=scale",
        "token-123"
      )
    ).toBe(
      "https://port-39380-pvelxc-abc.example.com/vnc.html?autoconnect=1&resize=scale&tkn=token-123"
    );
  });

  test("replaces a stale token", () => {
    expect(
      vncUrlWithToken(
        "https://port-39380-pvelxc-abc.example.com/vnc.html?tkn=old-token&autoconnect=1",
        "new-token"
      )
    ).toBe(
      "https://port-39380-pvelxc-abc.example.com/vnc.html?tkn=new-token&autoconnect=1"
    );
  });

  test("returns the original URL when no token is available", () => {
    expect(vncUrlWithToken("https://port-39380-pvelxc-abc.example.com", null)).toBe(
      "https://port-39380-pvelxc-abc.example.com"
    );
  });

  test("returns undefined when no VNC URL is available", () => {
    expect(vncUrlWithToken(undefined, "token-123")).toBeUndefined();
  });
});
