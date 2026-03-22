import { describe, expect, it } from "vitest";
import {
  prePushHook,
  preCommitHook,
  generatePrePushHook,
  generatePreCommitHook,
  type GitHooksConfig,
} from "./gitHooks";

describe("gitHooks", () => {
  describe("prePushHook (static)", () => {
    it("is a bash script", () => {
      expect(prePushHook.startsWith("#!/bin/bash")).toBe(true);
    });

    it("includes default protected branches", () => {
      expect(prePushHook).toContain("main master develop production staging");
    });

    it("blocks pushes to protected branches", () => {
      expect(prePushHook).toContain("Pushing to protected branch");
      expect(prePushHook).toContain("exit 1");
    });

    it("detects force pushes", () => {
      expect(prePushHook).toContain("Force push detected");
    });

    it("prevents branch deletion", () => {
      expect(prePushHook).toContain("Branch deletion is not allowed");
    });
  });

  describe("preCommitHook (static)", () => {
    it("is a bash script", () => {
      expect(preCommitHook.startsWith("#!/bin/bash")).toBe(true);
    });

    it("includes default protected branches", () => {
      expect(preCommitHook).toContain("main master develop production staging");
    });

    it("blocks direct commits to protected branches", () => {
      expect(preCommitHook).toContain("Direct commits to protected branch");
      expect(preCommitHook).toContain("exit 1");
    });

    it("suggests creating a pull request", () => {
      expect(preCommitHook).toContain("submit a pull request");
    });
  });

  describe("generatePrePushHook", () => {
    it("generates bash script with default config", () => {
      const hook = generatePrePushHook();
      expect(hook.startsWith("#!/bin/bash")).toBe(true);
    });

    it("uses default protected branches when not specified", () => {
      const hook = generatePrePushHook();
      expect(hook).toContain("main master develop production staging");
    });

    it("uses custom protected branches when specified", () => {
      const config: GitHooksConfig = {
        protectedBranches: ["main", "release"],
      };
      const hook = generatePrePushHook(config);
      expect(hook).toContain('protected_branches="main release"');
      expect(hook).not.toContain("develop");
    });

    it("includes force push check by default", () => {
      const hook = generatePrePushHook();
      expect(hook).toContain("Force push detected");
      expect(hook).toContain("git merge-base");
    });

    it("excludes force push check when allowForcePush is true", () => {
      const config: GitHooksConfig = {
        allowForcePush: true,
      };
      const hook = generatePrePushHook(config);
      expect(hook).not.toContain("Force push detected");
    });

    it("includes branch deletion check by default", () => {
      const hook = generatePrePushHook();
      expect(hook).toContain("Branch deletion is not allowed");
    });

    it("excludes branch deletion check when allowBranchDeletion is true", () => {
      const config: GitHooksConfig = {
        allowBranchDeletion: true,
      };
      const hook = generatePrePushHook(config);
      expect(hook).not.toContain("Branch deletion is not allowed");
    });

    it("can disable both force push and branch deletion", () => {
      const config: GitHooksConfig = {
        allowForcePush: true,
        allowBranchDeletion: true,
      };
      const hook = generatePrePushHook(config);
      expect(hook).not.toContain("Force push detected");
      expect(hook).not.toContain("Branch deletion is not allowed");
    });

    it("still protects branches even when other checks are disabled", () => {
      const config: GitHooksConfig = {
        protectedBranches: ["prod"],
        allowForcePush: true,
        allowBranchDeletion: true,
      };
      const hook = generatePrePushHook(config);
      expect(hook).toContain("Pushing to protected branch");
    });

    it("exits successfully at end of script", () => {
      const hook = generatePrePushHook();
      expect(hook.trim().endsWith("exit 0")).toBe(true);
    });
  });

  describe("generatePreCommitHook", () => {
    it("generates bash script with default config", () => {
      const hook = generatePreCommitHook();
      expect(hook.startsWith("#!/bin/bash")).toBe(true);
    });

    it("uses default protected branches when not specified", () => {
      const hook = generatePreCommitHook();
      expect(hook).toContain("main master develop production staging");
    });

    it("uses custom protected branches when specified", () => {
      const config: GitHooksConfig = {
        protectedBranches: ["main", "staging"],
      };
      const hook = generatePreCommitHook(config);
      expect(hook).toContain('protected_branches="main staging"');
      expect(hook).not.toContain("develop");
      expect(hook).not.toContain("production");
    });

    it("blocks direct commits to protected branches", () => {
      const hook = generatePreCommitHook();
      expect(hook).toContain("Direct commits to protected branch");
    });

    it("suggests creating a feature branch", () => {
      const hook = generatePreCommitHook();
      expect(hook).toContain("create a feature branch");
    });

    it("exits successfully at end of script", () => {
      const hook = generatePreCommitHook();
      expect(hook.trim().endsWith("exit 0")).toBe(true);
    });

    it("ignores allowForcePush config (not applicable to pre-commit)", () => {
      const config: GitHooksConfig = {
        protectedBranches: ["main"],
        allowForcePush: true,
      };
      const hook = generatePreCommitHook(config);
      // Should still work, just ignores the irrelevant option
      expect(hook).toContain('protected_branches="main"');
    });

    it("ignores allowBranchDeletion config (not applicable to pre-commit)", () => {
      const config: GitHooksConfig = {
        protectedBranches: ["main"],
        allowBranchDeletion: true,
      };
      const hook = generatePreCommitHook(config);
      // Should still work, just ignores the irrelevant option
      expect(hook).toContain('protected_branches="main"');
    });
  });

  describe("edge cases", () => {
    it("handles empty protected branches array by using defaults", () => {
      const config: GitHooksConfig = {
        protectedBranches: [],
      };
      const prePush = generatePrePushHook(config);
      const preCommit = generatePreCommitHook(config);

      // Empty array joined is "", which is falsy, so fallback to default
      expect(prePush).toContain("main master develop production staging");
      expect(preCommit).toContain("main master develop production staging");
    });

    it("handles single protected branch", () => {
      const config: GitHooksConfig = {
        protectedBranches: ["main"],
      };
      const hook = generatePrePushHook(config);
      expect(hook).toContain('protected_branches="main"');
    });

    it("handles branch names with hyphens", () => {
      const config: GitHooksConfig = {
        protectedBranches: ["feature-branch", "release-candidate"],
      };
      const hook = generatePrePushHook(config);
      expect(hook).toContain("feature-branch release-candidate");
    });
  });
});
