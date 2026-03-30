import { describe, expect, it } from "vitest";
import { PERMISSION_RULE_CONTEXTS } from "./PermissionRulesSection";

describe("PERMISSION_RULE_CONTEXTS", () => {
  it("includes local_dev", () => {
    expect(PERMISSION_RULE_CONTEXTS).toEqual([
      "task_sandbox",
      "cloud_workspace",
      "local_dev",
    ]);
  });
});
