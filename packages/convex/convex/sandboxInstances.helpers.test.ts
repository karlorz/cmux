import { describe, expect, it } from "vitest";

import {
  buildSandboxInstanceActivityInsert,
  buildSandboxInstanceActivityMetadata,
} from "./sandboxInstances.helpers";

describe("sandboxInstances helpers", () => {
  it("stores isCloudWorkspace in shared activity metadata", () => {
    expect(
      buildSandboxInstanceActivityMetadata({
        teamId: "team_123",
        userId: "user_123",
        isCloudWorkspace: true,
      }),
    ).toEqual({
      teamId: "team_123",
      userId: "user_123",
      isCloudWorkspace: true,
    });
  });

  it("preserves false isCloudWorkspace values for non-cloud sandboxes", () => {
    expect(
      buildSandboxInstanceActivityMetadata({
        isCloudWorkspace: false,
      }),
    ).toEqual({
      isCloudWorkspace: false,
    });
  });

  it("stores isCloudWorkspace on inserted activity rows", () => {
    expect(
      buildSandboxInstanceActivityInsert(
        {
          instanceId: "pvelxc-123",
          provider: "pve-lxc",
          snapshotId: "snapshot-123",
          isCloudWorkspace: true,
        },
        1234567890,
      ),
    ).toEqual({
      instanceId: "pvelxc-123",
      provider: "pve-lxc",
      snapshotId: "snapshot-123",
      isCloudWorkspace: true,
      createdAt: 1234567890,
    });
  });
});
