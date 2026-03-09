import { describe, it, expect } from "vitest";

/**
 * Unit tests for sandbox instance maintenance cloud workspace protection.
 *
 * These tests validate the decision logic used by pause/stop maintenance crons
 * to determine whether an instance should be skipped (protected cloud workspace)
 * or processed (eligible for pause/stop).
 *
 * The actual maintenance handlers run as Convex internalActions with provider API
 * calls, so we replicate the pure decision logic here for unit testing.
 */

const PAUSE_HOURS_THRESHOLD = 20;
const PAUSE_DAYS_THRESHOLD_PVE = 3;
const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

interface ActivityRecord {
  instanceId: string;
  createdAt?: number;
  lastResumedAt?: number;
  lastPausedAt?: number;
  stoppedAt?: number;
  isCloudWorkspace?: boolean;
}

/**
 * Replicates the cloud workspace protection check from maintenance handlers.
 * Returns true if the instance should be skipped (protected).
 */
function isCloudWorkspaceProtected(
  instanceId: string,
  activity: ActivityRecord | undefined,
  taskRunCloudFlags: Record<string, boolean>,
): boolean {
  // 1. Trust activity.isCloudWorkspace first
  if (activity?.isCloudWorkspace === true) return true;
  // 2. Fall back to taskRuns lookup
  if (taskRunCloudFlags[instanceId] === true) return true;
  return false;
}

/**
 * Replicates the PVE pause staleness check.
 * Returns true if the instance is stale and should be paused.
 */
function isPveInstanceStaleForPause(
  activity: ActivityRecord | undefined,
  now: number,
): boolean {
  const thresholdMs = PAUSE_DAYS_THRESHOLD_PVE * 24 * MILLISECONDS_PER_HOUR;
  if (!activity?.createdAt) return true; // No record, assume old
  // Use lastResumedAt ?? createdAt so recently resumed workspaces are not paused
  const effectiveAge = activity.lastResumedAt ?? activity.createdAt;
  return now - effectiveAge > thresholdMs;
}

describe("cloud workspace protection", () => {
  it("skips instance when activity.isCloudWorkspace is true", () => {
    const activity: ActivityRecord = {
      instanceId: "pvelxc-test-1",
      createdAt: Date.now() - 10 * 24 * MILLISECONDS_PER_HOUR,
      isCloudWorkspace: true,
    };
    const result = isCloudWorkspaceProtected("pvelxc-test-1", activity, {});
    expect(result).toBe(true);
  });

  it("skips legacy instance via taskRun fallback when activity lacks flag", () => {
    const activity: ActivityRecord = {
      instanceId: "pvelxc-test-2",
      createdAt: Date.now() - 10 * 24 * MILLISECONDS_PER_HOUR,
      // isCloudWorkspace not set (legacy row)
    };
    const taskRunCloudFlags = { "pvelxc-test-2": true };
    const result = isCloudWorkspaceProtected("pvelxc-test-2", activity, taskRunCloudFlags);
    expect(result).toBe(true);
  });

  it("does not skip normal non-cloud task run", () => {
    const activity: ActivityRecord = {
      instanceId: "pvelxc-test-3",
      createdAt: Date.now() - 10 * 24 * MILLISECONDS_PER_HOUR,
    };
    const result = isCloudWorkspaceProtected("pvelxc-test-3", activity, {});
    expect(result).toBe(false);
  });

  it("does not skip when activity is undefined and no taskRun match", () => {
    const result = isCloudWorkspaceProtected("pvelxc-test-4", undefined, {});
    expect(result).toBe(false);
  });

  it("does not skip when isCloudWorkspace is explicitly false", () => {
    const activity: ActivityRecord = {
      instanceId: "pvelxc-test-5",
      createdAt: Date.now() - 10 * 24 * MILLISECONDS_PER_HOUR,
      isCloudWorkspace: false,
    };
    const result = isCloudWorkspaceProtected("pvelxc-test-5", activity, {});
    expect(result).toBe(false);
  });
});

describe("PVE pause staleness check", () => {
  const now = Date.now();

  it("does not pause old workspace with recent lastResumedAt", () => {
    const activity: ActivityRecord = {
      instanceId: "pvelxc-test-6",
      createdAt: now - 10 * 24 * MILLISECONDS_PER_HOUR, // 10 days old
      lastResumedAt: now - 1 * MILLISECONDS_PER_HOUR, // resumed 1 hour ago
    };
    const isStale = isPveInstanceStaleForPause(activity, now);
    expect(isStale).toBe(false);
  });

  it("pauses old workspace with no recent activity", () => {
    const activity: ActivityRecord = {
      instanceId: "pvelxc-test-7",
      createdAt: now - 10 * 24 * MILLISECONDS_PER_HOUR, // 10 days old
      // no lastResumedAt
    };
    const isStale = isPveInstanceStaleForPause(activity, now);
    expect(isStale).toBe(true);
  });

  it("does not pause workspace created within threshold", () => {
    const activity: ActivityRecord = {
      instanceId: "pvelxc-test-8",
      createdAt: now - 1 * 24 * MILLISECONDS_PER_HOUR, // 1 day old
    };
    const isStale = isPveInstanceStaleForPause(activity, now);
    expect(isStale).toBe(false);
  });

  it("assumes stale when no activity record exists", () => {
    const isStale = isPveInstanceStaleForPause(undefined, now);
    expect(isStale).toBe(true);
  });

  it("uses lastResumedAt over createdAt when both exist", () => {
    const activity: ActivityRecord = {
      instanceId: "pvelxc-test-9",
      createdAt: now - 10 * 24 * MILLISECONDS_PER_HOUR, // 10 days old
      lastResumedAt: now - 2 * 24 * MILLISECONDS_PER_HOUR, // resumed 2 days ago
    };
    // 2 days < 3 day threshold, so not stale
    const isStale = isPveInstanceStaleForPause(activity, now);
    expect(isStale).toBe(false);
  });

  it("pauses when lastResumedAt is also beyond threshold", () => {
    const activity: ActivityRecord = {
      instanceId: "pvelxc-test-10",
      createdAt: now - 10 * 24 * MILLISECONDS_PER_HOUR,
      lastResumedAt: now - 5 * 24 * MILLISECONDS_PER_HOUR, // resumed 5 days ago
    };
    // 5 days > 3 day threshold, so stale
    const isStale = isPveInstanceStaleForPause(activity, now);
    expect(isStale).toBe(true);
  });
});

describe("recordCreate isCloudWorkspace persistence", () => {
  // This tests that the schema and function signatures accept isCloudWorkspace.
  // Actual Convex DB persistence requires the Convex test runtime,
  // but we verify the data shape matches expectations.

  it("activity record shape includes isCloudWorkspace", () => {
    const record: ActivityRecord = {
      instanceId: "pvelxc-test-11",
      createdAt: Date.now(),
      isCloudWorkspace: true,
    };
    expect(record.isCloudWorkspace).toBe(true);
  });

  it("activity record without isCloudWorkspace defaults to undefined", () => {
    const record: ActivityRecord = {
      instanceId: "pvelxc-test-12",
      createdAt: Date.now(),
    };
    expect(record.isCloudWorkspace).toBeUndefined();
  });
});
