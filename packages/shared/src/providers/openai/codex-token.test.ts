import { describe, expect, it } from "vitest";
import {
  getCodexTokenExpiresAtMs,
  isCodexTokenExpired,
  isCodexTokenExpiring,
  parseCodexAuthJson,
} from "./codex-token";

function base64UrlEncodeJson(value: unknown): string {
  const json = JSON.stringify(value);
  const base64 = Buffer.from(json, "utf-8").toString("base64");
  return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = base64UrlEncodeJson({ alg: "none", typ: "JWT" });
  const body = base64UrlEncodeJson(payload);
  return `${header}.${body}.sig`;
}

describe("parseCodexAuthJson", () => {
  it("parses tokens from nested tokens shape", () => {
    const access_token = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    const raw = JSON.stringify({
      auth_mode: "chatgpt",
      tokens: {
        access_token,
        refresh_token: "rt_test",
        id_token: makeJwt({ aud: ["app_test"] }),
        account_id: "acct_123",
      },
    });

    const parsed = parseCodexAuthJson(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.access_token).toBe(access_token);
    expect(parsed!.refresh_token).toBe("rt_test");
    expect(parsed!.account_id).toBe("acct_123");
  });

  it("parses tokens from flat shape", () => {
    const access_token = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    const raw = JSON.stringify({
      access_token,
      refresh_token: "rt_test",
      id_token: makeJwt({ aud: ["app_test"] }),
      email: "test@example.com",
    });

    const parsed = parseCodexAuthJson(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.email).toBe("test@example.com");
  });

  it("returns null for invalid JSON", () => {
    expect(parseCodexAuthJson("{not-json")).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    expect(parseCodexAuthJson(JSON.stringify({ tokens: {} }))).toBeNull();
  });
});

describe("expiry helpers", () => {
  it("derives expiresAt from access_token exp when expires_at is missing", () => {
    const expSeconds = Math.floor(Date.now() / 1000) + 60;
    const auth = parseCodexAuthJson(
      JSON.stringify({
        tokens: { access_token: makeJwt({ exp: expSeconds }), refresh_token: "rt" },
      })
    )!;

    const expiresAtMs = getCodexTokenExpiresAtMs(auth);
    expect(expiresAtMs).toBe(expSeconds * 1000);
  });

  it("treats token as expiring within lead time", () => {
    const expSeconds = Math.floor(Date.now() / 1000) + 30;
    const auth = parseCodexAuthJson(
      JSON.stringify({
        tokens: { access_token: makeJwt({ exp: expSeconds }), refresh_token: "rt" },
      })
    )!;
    expect(isCodexTokenExpiring(auth, 60_000)).toBe(true);
  });

  it("treats token as expired when exp is in the past", () => {
    const expSeconds = Math.floor(Date.now() / 1000) - 10;
    const auth = parseCodexAuthJson(
      JSON.stringify({
        tokens: { access_token: makeJwt({ exp: expSeconds }), refresh_token: "rt" },
      })
    )!;
    expect(isCodexTokenExpired(auth)).toBe(true);
  });
});

