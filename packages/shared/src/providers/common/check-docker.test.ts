import { describe, expect, it } from "vitest";
import {
  checkDockerStatus,
  ensureDockerBinaryInPath,
  ensureDockerDaemonReady,
  getDockerSocketCandidates,
} from "./check-docker";

describe("check-docker exports", () => {
  it("exports checkDockerStatus function", () => {
    expect(typeof checkDockerStatus).toBe("function");
  });

  it("exports ensureDockerBinaryInPath function", () => {
    expect(typeof ensureDockerBinaryInPath).toBe("function");
  });

  it("exports ensureDockerDaemonReady function", () => {
    expect(typeof ensureDockerDaemonReady).toBe("function");
  });

  it("exports getDockerSocketCandidates function", () => {
    expect(typeof getDockerSocketCandidates).toBe("function");
  });
});

describe("getDockerSocketCandidates", () => {
  it("returns an object with remoteHost and candidates", () => {
    const result = getDockerSocketCandidates();
    expect(result).toHaveProperty("remoteHost");
    expect(result).toHaveProperty("candidates");
    expect(typeof result.remoteHost).toBe("boolean");
    expect(Array.isArray(result.candidates)).toBe(true);
  });

  it("returns non-empty candidates when no DOCKER_HOST is set", () => {
    // When DOCKER_HOST is not set, should return default socket candidates
    const originalHost = process.env.DOCKER_HOST;
    delete process.env.DOCKER_HOST;
    delete process.env.DOCKER_SOCKET;

    try {
      const result = getDockerSocketCandidates();
      expect(result.remoteHost).toBe(false);
      // Should have at least one candidate path
      expect(result.candidates.length).toBeGreaterThan(0);
    } finally {
      if (originalHost !== undefined) {
        process.env.DOCKER_HOST = originalHost;
      }
    }
  });
});

describe("ensureDockerBinaryInPath", () => {
  it("does not throw", () => {
    expect(() => ensureDockerBinaryInPath()).not.toThrow();
  });
});

describe("checkDockerStatus", () => {
  it("returns a Promise", () => {
    const result = checkDockerStatus();
    expect(result).toBeInstanceOf(Promise);
  });

  it("returns an object with isRunning property", async () => {
    const result = await checkDockerStatus();
    expect(result).toHaveProperty("isRunning");
    expect(typeof result.isRunning).toBe("boolean");
  });
});

describe("ensureDockerDaemonReady", () => {
  it("returns a Promise", () => {
    const result = ensureDockerDaemonReady();
    expect(result).toBeInstanceOf(Promise);
  });

  it("returns an object with ready property", async () => {
    const result = await ensureDockerDaemonReady();
    expect(result).toHaveProperty("ready");
    expect(typeof result.ready).toBe("boolean");
  });
});
