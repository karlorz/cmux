import { afterEach, expect, test } from "bun:test";

import worker from "./index";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("passes through noVNC JavaScript while preserving VS Code JavaScript rewriting", async () => {
  const noVncJavaScript = "export class RFB {}";
  const vsCodeJavaScript = "window.location.href = '/';";
  const upstreamRequests: Request[] = [];

  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    if (!(input instanceof Request)) {
      throw new Error("Expected the Worker to fetch a Request");
    }

    upstreamRequests.push(input);
    const body = input.url.includes("port-39380-")
      ? noVncJavaScript
      : vsCodeJavaScript;

    return new Response(body, {
      headers: { "content-type": "application/javascript" },
    });
  };

  const noVncRequest = new Request(
    "https://port-39380-pvelxc-sandbox.alphasolves.com/core/rfb.js",
  );
  const noVncResponse = await worker.fetch(noVncRequest);

  expect(await noVncResponse.text()).toBe(noVncJavaScript);
  expect(upstreamRequests).toHaveLength(1);
  expect(upstreamRequests[0]).toBe(noVncRequest);
  expect(upstreamRequests[0]?.headers.get("X-Cmux-Proxied")).toBeNull();

  const vsCodeRequest = new Request(
    "https://port-39378-pvelxc-sandbox.alphasolves.com/workbench.js",
  );
  const vsCodeResponse = await worker.fetch(vsCodeRequest);

  expect(await vsCodeResponse.text()).toContain("Injected by cmux proxy");
});
