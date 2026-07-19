import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Regression guard for Coolify Docker (cmux-server) rust-builder stage.
 *
 * Cargo.lock under native/core is gitignored, so the Dockerfile must:
 * 1. Use a rustc new enough for current crates.io MSRVs (kstring 2.0.4 needs 1.96+)
 * 2. Pin crates that break when "latest" is resolved without a lockfile
 *
 * Failure mode observed 2026-07-19:
 *   rustc 1.86.0 is not supported by kstring@2.0.4 (requires rustc 1.96.0)
 *   → npx napi build --platform --release exit 1
 *   → Coolify Deploy blocked waiting for cmux-server image
 */
const dockerfilePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "Dockerfile"
);

function parseRustImageTag(dockerfile: string): string | null {
  const match = dockerfile.match(
    /^FROM\s+rust:([^\s]+)\s+AS\s+rust-builder\s*$/m
  );
  return match?.[1] ?? null;
}

function parseRustcMajorMinor(tag: string): { major: number; minor: number } {
  // Tags look like "1.97-slim-bookworm" or "1.97.1-slim-bookworm"
  const match = tag.match(/^(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`Unable to parse rust image version from tag: ${tag}`);
  }
  return { major: Number(match[1]), minor: Number(match[2]) };
}

describe("apps/server Dockerfile rust-builder MSRV pins", () => {
  const dockerfile = readFileSync(dockerfilePath, "utf8");

  it("uses a rust base image that satisfies kstring 2.0.4 MSRV (rustc >= 1.96)", () => {
    const tag = parseRustImageTag(dockerfile);
    expect(tag, "missing FROM rust:… AS rust-builder").toBeTruthy();
    const { major, minor } = parseRustcMajorMinor(tag!);
    const rustcVersion = major * 1000 + minor;
    const minRequired = 1 * 1000 + 96; // 1.96
    expect(
      rustcVersion,
      `rust image tag "${tag}" is older than required 1.96`
    ).toBeGreaterThanOrEqual(minRequired);
  });

  it("pins kstring (and related crates) before napi build so lockless resolve cannot pull a broken latest", () => {
    // The RUN that pins crates must appear before the napi build RUN.
    const pinBlockMatch = dockerfile.match(
      /RUN cargo update[\s\S]*?kstring --precise\s+([0-9.]+)[\s\S]*?\nRUN npx napi build --platform --release/
    );
    expect(
      pinBlockMatch,
      "expected cargo update … kstring --precise … then napi build"
    ).toBeTruthy();

    // 2.0.2 is known-good with older toolchains; 2.0.4 requires rustc 1.96.
    // Accept any 2.0.x pin strictly less than 2.0.4, or 2.0.2 exactly as used in CI fix.
    const pinned = pinBlockMatch![1];
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
    const [maj, min, patch] = pinned.split(".").map(Number);
    expect(maj).toBe(2);
    expect(min).toBe(0);
    expect(patch).toBeLessThan(4);

    for (const crate of [
      "home --precise 0.5.11",
      "human_format --precise 1.1.0",
      "unicode-segmentation --precise 1.12.0",
    ] as const) {
      expect(dockerfile).toContain(`cargo update ${crate}`);
    }
  });
});
