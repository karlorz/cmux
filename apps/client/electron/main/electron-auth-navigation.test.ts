import { describe, expect, it } from "vitest";
import {
  buildSpaOrigins,
  classifyAuthWindowNavigation,
  classifyMainWindowNavigation,
  isOAuthProviderUrl,
  isSpaAuthCallback,
  isSpaOrigin,
  rewriteHandlerPathToHash,
} from "./electron-auth-navigation";

const SPA = ["http://localhost:5173", "https://cmux.local"] as const;

describe("rewriteHandlerPathToHash", () => {
  it("rewrites path-style Stack handler to hash router form", () => {
    expect(
      rewriteHandlerPathToHash(
        "http://localhost:5173/handler/oauth-callback?code=abc&state=xyz"
      )
    ).toBe(
      "http://localhost:5173/#/handler/oauth-callback?code=abc&state=xyz"
    );
  });

  it("returns null when already hash-routed", () => {
    expect(
      rewriteHandlerPathToHash(
        "http://localhost:5173/#/handler/oauth-callback?code=1"
      )
    ).toBeNull();
  });

  it("returns null for non-handler SPA paths", () => {
    expect(
      rewriteHandlerPathToHash("http://localhost:5173/sign-in")
    ).toBeNull();
  });
});

describe("isOAuthProviderUrl", () => {
  it("detects Stack and GitHub hosts", () => {
    expect(
      isOAuthProviderUrl(
        "https://api.stack-auth.com/api/v1/auth/oauth/authorize/github"
      )
    ).toBe(true);
    expect(isOAuthProviderUrl("https://github.com/login/oauth/authorize")).toBe(
      true
    );
    expect(isOAuthProviderUrl("https://api.stack-auth.com/session")).toBe(true);
  });

  it("rejects SPA and unrelated hosts", () => {
    expect(isOAuthProviderUrl("http://localhost:5173/")).toBe(false);
    expect(isOAuthProviderUrl("https://example.com")).toBe(false);
  });
});

describe("classifyMainWindowNavigation", () => {
  it("allows SPA navigations", () => {
    expect(
      classifyMainWindowNavigation("http://localhost:5173/#/sign-in", {
        spaOrigins: SPA,
      })
    ).toEqual({ action: "allow" });
  });

  it("rewrites SPA /handler path callbacks", () => {
    expect(
      classifyMainWindowNavigation(
        "http://localhost:5173/handler/oauth-callback?code=1",
        { spaOrigins: SPA }
      )
    ).toEqual({
      action: "rewrite-hash",
      url: "http://localhost:5173/#/handler/oauth-callback?code=1",
    });
  });

  it("routes OAuth hosts to auth-window", () => {
    expect(
      classifyMainWindowNavigation(
        "https://api.stack-auth.com/api/v1/auth/oauth/authorize/github?x=1",
        { spaOrigins: SPA }
      )
    ).toEqual({
      action: "auth-window",
      url: "https://api.stack-auth.com/api/v1/auth/oauth/authorize/github?x=1",
    });
  });

  it("opens other http(s) externally", () => {
    expect(
      classifyMainWindowNavigation("https://docs.example.com/guide", {
        spaOrigins: SPA,
      })
    ).toEqual({
      action: "external",
      url: "https://docs.example.com/guide",
    });
  });

  it("allows non-http schemes", () => {
    expect(
      classifyMainWindowNavigation("devtools://devtools/bundled/index.html", {
        spaOrigins: SPA,
      })
    ).toEqual({ action: "allow" });
  });
});

describe("classifyAuthWindowNavigation", () => {
  it("allows OAuth inside auth window", () => {
    expect(
      classifyAuthWindowNavigation("https://api.stack-auth.com/session", {
        spaOrigins: SPA,
      })
    ).toEqual({ action: "allow" });
  });

  it("rewrites SPA handler callback for handoff to main", () => {
    expect(
      classifyAuthWindowNavigation(
        "http://localhost:5173/handler/oauth-callback?code=z",
        { spaOrigins: SPA }
      )
    ).toEqual({
      action: "rewrite-hash",
      url: "http://localhost:5173/#/handler/oauth-callback?code=z",
    });
  });
});

describe("isSpaAuthCallback", () => {
  it("detects path and hash handler URLs on SPA", () => {
    expect(
      isSpaAuthCallback("http://localhost:5173/handler/oauth-callback", SPA)
    ).toBe(true);
    expect(
      isSpaAuthCallback(
        "http://localhost:5173/#/handler/oauth-callback?code=1",
        SPA
      )
    ).toBe(true);
    expect(isSpaAuthCallback("http://localhost:5173/#/sign-in", SPA)).toBe(
      false
    );
  });
});

describe("buildSpaOrigins / isSpaOrigin", () => {
  it("includes app host and renderer origin", () => {
    const origins = buildSpaOrigins({
      appHost: "cmux.local",
      electronRendererUrl: "http://localhost:5173/",
    });
    expect(origins).toContain("https://cmux.local");
    expect(origins).toContain("http://localhost:5173");
    expect(isSpaOrigin("http://localhost:5173/foo", origins)).toBe(true);
    expect(isSpaOrigin("https://cmux.local/index-electron.html", origins)).toBe(
      true
    );
  });
});
