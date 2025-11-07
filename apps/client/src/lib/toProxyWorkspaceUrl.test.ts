import { describe, expect, it } from "vitest";
import { LOCAL_VSCODE_PLACEHOLDER_HOST } from "@cmux/shared";
import {
  rewriteLocalWorkspaceUrlIfNeeded,
  toProxyWorkspaceUrl,
} from "./toProxyWorkspaceUrl";

const PLACEHOLDER_URL = `http://${LOCAL_VSCODE_PLACEHOLDER_HOST}/?folder=/tmp/foo`;

describe("rewriteLocalWorkspaceUrlIfNeeded", () => {
  it("rewrites placeholder host urls to preferred origin", () => {
    const preferredOrigin = "http://localhost:4100";
    expect(
      rewriteLocalWorkspaceUrlIfNeeded(PLACEHOLDER_URL, preferredOrigin)
    ).toBe(`${preferredOrigin}/?folder=/tmp/foo`);
  });

  it("leaves localhost docker workspace urls untouched", () => {
    const dockerUrl = "http://localhost:5050/?folder=/root/workspace";
    const preferredOrigin = "http://localhost:4100";
    expect(
      rewriteLocalWorkspaceUrlIfNeeded(dockerUrl, preferredOrigin)
    ).toBe(dockerUrl);
  });
});

describe("toProxyWorkspaceUrl", () => {
  it("returns docker workspace urls as-is", () => {
    const dockerUrl = "http://127.0.0.1:5050/?folder=/root/workspace";
    const preferredOrigin = "http://localhost:4100";
    expect(toProxyWorkspaceUrl(dockerUrl, preferredOrigin)).toBe(dockerUrl);
  });
});
