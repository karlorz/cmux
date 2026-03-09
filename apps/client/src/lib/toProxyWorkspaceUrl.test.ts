import { describe, expect, it } from "vitest";
import {
  resolveBrowserPreviewUrl,
  toGenericVncUrl,
  toMorphVncUrl,
  toVncViewerUrl,
} from "./toProxyWorkspaceUrl";

describe("toMorphVncUrl", () => {
  it("adds noVNC reconnect defaults for Morph workspaces", () => {
    const result = toMorphVncUrl(
      "https://port-39378-morphvm-abc123.http.cloud.morph.so/?foo=bar",
    );

    expect(result).toBe(
      "https://port-39380-morphvm-abc123.http.cloud.morph.so/vnc.html?autoconnect=1&resize=scale",
    );
  });
});

describe("toGenericVncUrl", () => {
  it("adds noVNC reconnect defaults for generic proxy workspaces", () => {
    const result = toGenericVncUrl(
      "https://port-39378-pvelxc-1cc7473f.alphasolves.com/?foo=bar",
    );

    expect(result).toBe(
      "https://port-39380-pvelxc-1cc7473f.alphasolves.com/vnc.html?autoconnect=1&resize=scale",
    );
  });
});

describe("toVncViewerUrl", () => {
  it("adds reconnect defaults when converting a base VNC URL", () => {
    const result = toVncViewerUrl(
      "https://vnc-201.example.com/?foo=bar",
    );

    expect(result).toBe(
      "https://vnc-201.example.com/vnc.html?foo=bar&autoconnect=1&resize=scale",
    );
  });

  it("preserves explicit noVNC query params on an existing viewer URL", () => {
    const result = toVncViewerUrl(
      "https://vnc-201.example.com/vnc.html?autoconnect=0&resize=remote&reconnect=0&reconnect_delay=1000",
    );

    expect(result).toBe(
      "https://vnc-201.example.com/vnc.html?autoconnect=0&resize=remote&reconnect=0&reconnect_delay=1000",
    );
  });
});

describe("resolveBrowserPreviewUrl", () => {
  it("prefers vncUrl over workspaceUrl and applies reconnect defaults", () => {
    const result = resolveBrowserPreviewUrl({
      vncUrl: "https://vnc-201.example.com/",
      workspaceUrl:
        "https://port-39378-pvelxc-1cc7473f.alphasolves.com/?ignored=true",
    });

    expect(result).toBe(
      "https://vnc-201.example.com/vnc.html?autoconnect=1&resize=scale",
    );
  });
});
