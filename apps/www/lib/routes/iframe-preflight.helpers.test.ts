import { afterEach, describe, expect, it } from "vitest";

import { isAllowedHost } from "./iframe-preflight.helpers";

const originalClientOrigin = process.env.NEXT_PUBLIC_CLIENT_ORIGIN;
const originalWwwOrigin = process.env.NEXT_PUBLIC_WWW_ORIGIN;
const originalServerOrigin = process.env.NEXT_PUBLIC_SERVER_ORIGIN;
const originalBaseAppUrl = process.env.NEXT_PUBLIC_BASE_APP_URL;

afterEach(() => {
  process.env.NEXT_PUBLIC_CLIENT_ORIGIN = originalClientOrigin;
  process.env.NEXT_PUBLIC_WWW_ORIGIN = originalWwwOrigin;
  process.env.NEXT_PUBLIC_SERVER_ORIGIN = originalServerOrigin;
  process.env.NEXT_PUBLIC_BASE_APP_URL = originalBaseAppUrl;
});

describe("isAllowedHost", () => {
  it("allows configured exact hosts", () => {
    expect(isAllowedHost("cmux.sh")).toBe(true);
    expect(isAllowedHost("www.manaflow.com")).toBe(true);
  });

  it("allows exact hosts derived from env-owned origins", () => {
    process.env.NEXT_PUBLIC_CLIENT_ORIGIN = "https://cmux.karldigi.dev";
    process.env.NEXT_PUBLIC_WWW_ORIGIN = "https://cmux-www.karldigi.dev";
    process.env.NEXT_PUBLIC_SERVER_ORIGIN = "https://cmux-server.karldigi.dev";
    process.env.NEXT_PUBLIC_BASE_APP_URL = "https://cmux-www.karldigi.dev";

    expect(isAllowedHost("cmux.karldigi.dev")).toBe(true);
    expect(isAllowedHost("cmux-www.karldigi.dev")).toBe(true);
    expect(isAllowedHost("cmux-server.karldigi.dev")).toBe(true);
  });

  it("allows configured host suffixes", () => {
    expect(isAllowedHost("preview.cmux.app")).toBe(true);
    expect(isAllowedHost("port-39379-morphvm-abc.http.cloud.morph.so")).toBe(
      true,
    );
  });

  it("allows localhost in non-production environments", () => {
    expect(isAllowedHost("localhost")).toBe(true);
    expect(isAllowedHost("127.0.0.1")).toBe(true);
  });

  it("rejects unrelated hosts", () => {
    expect(isAllowedHost("example.com")).toBe(false);
    expect(isAllowedHost("malicious.internal")).toBe(false);
  });
});
