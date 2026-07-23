import { describe, expect, it } from "vitest";

import {
  LEGACY_ELECTRON_PARTITION,
  resolveElectronPartition,
} from "./electron-partition";

describe("resolveElectronPartition", () => {
  it("keeps packaged builds on the existing persistent partition", () => {
    expect(resolveElectronPartition({ isPackaged: true })).toBe(
      LEGACY_ELECTRON_PARTITION,
    );
  });

  it("isolates development from the installed app partition", () => {
    expect(resolveElectronPartition({ isPackaged: false })).toBe(
      "persist:cmux-dev",
    );
  });

  it("uses a worktree-specific development partition override", () => {
    expect(
      resolveElectronPartition({
        isPackaged: false,
        override: "persist:cmux-dev-abc12345",
      }),
    ).toBe("persist:cmux-dev-abc12345");
  });

  it("ignores blank overrides", () => {
    expect(
      resolveElectronPartition({ isPackaged: false, override: "   " }),
    ).toBe("persist:cmux-dev");
  });

  it("rejects non-persistent overrides", () => {
    expect(() =>
      resolveElectronPartition({
        isPackaged: false,
        override: "temporary-partition",
      }),
    ).toThrow("must start with persist:");
  });
});
