import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { RemoteTagRef } from "./release-version";
import { planUpstreamTagSync } from "./upstream-tag-sync";

const currentDir = dirname(fileURLToPath(import.meta.url));
const fixtureDir = resolve(currentDir, "..", "fixtures", "upstream-tag-sync");

function readFixture(name: string): RemoteTagRef[] {
  return JSON.parse(
    readFileSync(resolve(fixtureDir, name), "utf8")
  ) as RemoteTagRef[];
}

describe("planUpstreamTagSync", () => {
  it("repairs conflicting plain release tags and ignores unrelated fork-only tags", () => {
    const originRefs = readFixture("origin-conflict.json");
    const upstreamRefs = readFixture("upstream-conflict.json");

    const plan = planUpstreamTagSync(originRefs, upstreamRefs);

    expect(plan.actions).toEqual([
      {
        type: "create",
        tag: "v1.0.266",
        upstreamObjectId: "727db8730aa9b6e94b834a5e44a4a1fd3e9ded37",
        originObjectId: null,
        deleteRelease: false,
      },
      {
        type: "repair",
        tag: "v1.0.269",
        upstreamObjectId: "c34fbe9fb60620c19d01f2e8f6c1cbcf6703e75a",
        originObjectId: "21528e72543fa9d5e09cef380231b143cb9f86ea",
        deleteRelease: true,
      },
    ]);
  });
});
