import { describe, expect, it } from "vitest";
import { checkGitStatus } from "./check-git";

describe("checkGitStatus", () => {
  it("returns a Promise", () => {
    const result = checkGitStatus();
    expect(result).toBeInstanceOf(Promise);
  });

  it("returns an object with isAvailable property", async () => {
    const result = await checkGitStatus();
    expect(result).toHaveProperty("isAvailable");
    expect(typeof result.isAvailable).toBe("boolean");
  });

  it("returns version when git is available", async () => {
    const result = await checkGitStatus();
    if (result.isAvailable) {
      expect(result).toHaveProperty("version");
      expect(typeof result.version).toBe("string");
    }
  });

  it("returns remoteAccess status when git is available", async () => {
    const result = await checkGitStatus();
    if (result.isAvailable) {
      expect(result).toHaveProperty("remoteAccess");
      expect(typeof result.remoteAccess).toBe("boolean");
    }
  });
});
