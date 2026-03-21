import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "..");
const fixtureDir = resolve(repoRoot, "scripts", "fixtures", "upstream-tag-sync");

describe("sync-upstream-tags.ts", () => {
  it("prints the expected dry-run repair plan for conflicting upstream tags", () => {
    const stdout = execFileSync(
      "bun",
      [
        "./scripts/sync-upstream-tags.ts",
        "--dry-run",
        "--json",
        "--origin-tags-json",
        resolve(fixtureDir, "origin-conflict.json"),
        "--upstream-tags-json",
        resolve(fixtureDir, "upstream-conflict.json"),
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
      }
    );

    expect(JSON.parse(stdout)).toEqual({
      mirroredTags: ["v1.0.266", "v1.0.269"],
      actions: [
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
      ],
    });
  });
});
