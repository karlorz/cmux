import { describe, expect, it } from "vitest";

import {
  buildRecordCreateActivityMetadata,
  buildRecordCreateInternalActivityMetadata,
} from "./sandboxInstanceActivityCreateHelpers";

describe("sandboxInstanceActivityCreateHelpers", () => {
  it("buildRecordCreateInternalActivityMetadata includes isCloudWorkspace", () => {
    const metadata = buildRecordCreateInternalActivityMetadata({
      hostname: "pvelxc-123",
      isCloudWorkspace: true,
      snapshotId: "snapshot_abc",
      snapshotProvider: "pve-lxc",
      teamId: "team_1",
      templateVmid: 9000,
      userId: "user_1",
      vmid: 1234,
    });

    expect(metadata.isCloudWorkspace).toBe(true);
    expect(metadata.teamId).toBe("team_1");
    expect(metadata.userId).toBe("user_1");
    expect(metadata.vmid).toBe(1234);
  });

  it("buildRecordCreateActivityMetadata includes isCloudWorkspace", () => {
    const metadata = buildRecordCreateActivityMetadata({
      hostname: "morphvm_123",
      isCloudWorkspace: false,
      snapshotId: "snapshot_xyz",
      snapshotProvider: "morph",
      teamId: "team_2",
      templateVmid: 9100,
      userId: "user_2",
      vmid: 5678,
    });

    expect(metadata.isCloudWorkspace).toBe(false);
    expect(metadata.teamId).toBe("team_2");
    expect(metadata.userId).toBe("user_2");
    expect(metadata.vmid).toBe(5678);
  });
});
