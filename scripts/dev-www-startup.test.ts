import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

describe("local WWW startup", () => {
  it("defines a Webpack dev command for linked worktrees", () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(resolve(repoRoot, "apps/www/package.json"), "utf8"),
    );

    expect(isRecord(packageJson)).toBe(true);
    if (!isRecord(packageJson)) {
      return;
    }

    const scripts = packageJson.scripts;
    expect(isRecord(scripts)).toBe(true);
    if (!isRecord(scripts)) {
      return;
    }

    expect(scripts["dev:webpack"]).toBe(
      "dotenv -e ../../.env -- next dev --port 9779 --webpack",
    );
  });

  it("uses the Webpack command from the local stack orchestrator", () => {
    const devScript = readFileSync(resolve(repoRoot, "scripts/dev.sh"), "utf8");

    expect(devScript).toContain(
      'bun run dev:webpack 2>&1 | tee "$LOG_DIR/www.log"',
    );
  });
});
