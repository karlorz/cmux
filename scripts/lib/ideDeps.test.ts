import { describe, expect, it } from "vitest";

import {
  applyPackageOverrides,
  formatPackageInstallSpec,
  isRemotePackageSource,
  parsePackageOverrides,
  type IdeDeps,
} from "./ideDeps";

describe("ideDeps package overrides", () => {
  it("parses and trims JSON overrides", () => {
    expect(
      parsePackageOverrides(
        JSON.stringify({
          " @anthropic-ai/claude-code ": " 2.1.87 ",
          "@openai/codex":
            " https://example.com/releases/download/codex.tgz ",
        }),
      ),
    ).toEqual({
      "@anthropic-ai/claude-code": "2.1.87",
      "@openai/codex": "https://example.com/releases/download/codex.tgz",
    });
  });

  it("applies overrides onto ide deps packages", () => {
    const deps: IdeDeps = {
      extensions: [],
      packages: {
        "@anthropic-ai/claude-code": "2.1.88",
        "@openai/codex": "0.118.0",
      },
    };

    expect(
      applyPackageOverrides(deps, {
        "@anthropic-ai/claude-code": "2.1.87",
      }),
    ).toBe(true);
    expect(deps.packages["@anthropic-ai/claude-code"]).toBe("2.1.87");
    expect(applyPackageOverrides(deps, {})).toBe(false);
  });

  it("formats install specs for versions and public tarball URLs", () => {
    expect(isRemotePackageSource("https://example.com/pkg.tgz")).toBe(true);
    expect(isRemotePackageSource("2.1.87")).toBe(false);
    expect(
      formatPackageInstallSpec("@anthropic-ai/claude-code", "2.1.87"),
    ).toBe("@anthropic-ai/claude-code@2.1.87");
    expect(
      formatPackageInstallSpec(
        "@anthropic-ai/claude-code",
        "https://example.com/releases/download/pkg.tgz",
      ),
    ).toBe("https://example.com/releases/download/pkg.tgz");
  });
});
