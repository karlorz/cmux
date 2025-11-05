import { Buffer } from "node:buffer";

import { describe, expect, afterEach, beforeEach, it, vi } from "vitest";

import {
  AUTH_JSON_REFRESH_BUFFER_MS,
  DEFAULT_AUTH_JSON_REFRESH_INTERVAL_MS,
  MIN_AUTH_JSON_REFRESH_INTERVAL_MS,
  getAuthJsonRefetchIntervalMs,
} from "./authJsonQueryOptions";

function base64UrlEncode(value: string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function buildJwt(expSecondsFromNow: number): string {
  const header = base64UrlEncode(JSON.stringify({ alg: "none", typ: "JWT" }));
  const exp = Math.floor((Date.now() + expSecondsFromNow * 1000) / 1000);
  const payload = base64UrlEncode(JSON.stringify({ exp }));
  return `${header}.${payload}.`;
}

describe("getAuthJsonRefetchIntervalMs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("falls back when no token is available", () => {
    expect(getAuthJsonRefetchIntervalMs(null)).toBe(
      DEFAULT_AUTH_JSON_REFRESH_INTERVAL_MS
    );
  });

  it("refreshes a minute before expiry for healthy tokens", () => {
    const token = buildJwt(5 * 60);
    expect(getAuthJsonRefetchIntervalMs(token)).toBe(
      5 * 60 * 1000 - AUTH_JSON_REFRESH_BUFFER_MS
    );
  });

  it("clamps to the minimum interval for near-expiry tokens", () => {
    const token = buildJwt(20);
    expect(getAuthJsonRefetchIntervalMs(token)).toBe(
      MIN_AUTH_JSON_REFRESH_INTERVAL_MS
    );
  });

  it("falls back for malformed tokens", () => {
    expect(getAuthJsonRefetchIntervalMs("not-a-token")).toBe(
      DEFAULT_AUTH_JSON_REFRESH_INTERVAL_MS
    );
  });
});
