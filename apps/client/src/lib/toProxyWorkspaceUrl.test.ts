import { describe, expect, it } from "vitest";
import { rewriteLocalWorkspaceUrlIfNeeded } from "./toProxyWorkspaceUrl";

const PLACEHOLDER_URL =
  "http://cmux-vscode.local/?folder=/Users/example/project";
const SERVE_WEB_ORIGIN = "http://localhost:39400";

describe("rewriteLocalWorkspaceUrlIfNeeded", () => {
  it("keeps docker VS Code URLs untouched", () => {
    const dockerUrl = "http://localhost:39378/?folder=/root/workspace";
    const result = rewriteLocalWorkspaceUrlIfNeeded(
      dockerUrl,
      SERVE_WEB_ORIGIN,
    );
    expect(result).toBe(dockerUrl);
  });

  it("rewrites placeholder URLs to the serve-web origin", () => {
    const result = rewriteLocalWorkspaceUrlIfNeeded(
      PLACEHOLDER_URL,
      SERVE_WEB_ORIGIN,
    );
    expect(result).toBe("http://localhost:39400/?folder=/Users/example/project");
  });

  it("returns the original URL when no origin is available", () => {
    const result = rewriteLocalWorkspaceUrlIfNeeded(PLACEHOLDER_URL, null);
    expect(result).toBe(PLACEHOLDER_URL);
  });
});
