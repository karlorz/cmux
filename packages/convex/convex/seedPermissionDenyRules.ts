/**
 * Seed Permission Deny Rules
 *
 * Seeds the default system-level permission deny rules that prevent
 * task sandboxes from bypassing cmux-managed workflows.
 *
 * These rules apply ONLY to task_sandbox context - NOT to cloud_workspace
 * (head agents) which need full capabilities.
 *
 * Run with: bunx convex run seedPermissionDenyRules:seed --env-file ../../.env
 */

import { internalMutation } from "./_generated/server";

/**
 * Default deny rules for task sandboxes.
 * Migrated from TASK_SANDBOX_DENY_RULES constant in environment.ts
 */
const SYSTEM_DENY_RULES = [
  // PR lifecycle - cmux manages PR creation/merging automatically
  {
    ruleId: "pdr_gh_pr_create",
    pattern: "Bash(gh pr create:*)",
    description: "PR creation is managed by cmux - agents should push to feature branches and let cmux create PRs",
    priority: 10,
  },
  {
    ruleId: "pdr_gh_pr_merge",
    pattern: "Bash(gh pr merge:*)",
    description: "PR merging requires human approval via cmux UI",
    priority: 10,
  },
  {
    ruleId: "pdr_gh_pr_close",
    pattern: "Bash(gh pr close:*)",
    description: "PR closing is managed through cmux workflow",
    priority: 10,
  },
  // Force push - destructive history rewrite
  {
    ruleId: "pdr_git_push_force",
    pattern: "Bash(git push --force:*)",
    description: "Force push destroys commit history - use regular push or create new commits",
    priority: 20,
  },
  {
    ruleId: "pdr_git_push_force_lease",
    pattern: "Bash(git push --force-with-lease:*)",
    description: "Force push (with lease) can still destroy history",
    priority: 20,
  },
  {
    ruleId: "pdr_git_push_f",
    pattern: "Bash(git push -f:*)",
    description: "Force push shorthand (-f) destroys commit history",
    priority: 20,
  },
  // Sandbox lifecycle - only orchestration system should manage
  {
    ruleId: "pdr_devsh_start",
    pattern: "Bash(devsh start:*)",
    description: "Sandbox creation is managed by cmux orchestration",
    priority: 30,
  },
  {
    ruleId: "pdr_devsh_delete",
    pattern: "Bash(devsh delete:*)",
    description: "Sandbox deletion is managed by cmux orchestration",
    priority: 30,
  },
  {
    ruleId: "pdr_devsh_pause",
    pattern: "Bash(devsh pause:*)",
    description: "Sandbox lifecycle is managed by cmux orchestration",
    priority: 30,
  },
  {
    ruleId: "pdr_devsh_resume",
    pattern: "Bash(devsh resume:*)",
    description: "Sandbox lifecycle is managed by cmux orchestration",
    priority: 30,
  },
  {
    ruleId: "pdr_cloudrouter_start",
    pattern: "Bash(cloudrouter start:*)",
    description: "Sandbox creation via cloudrouter is managed by cmux",
    priority: 30,
  },
  {
    ruleId: "pdr_cloudrouter_delete",
    pattern: "Bash(cloudrouter delete:*)",
    description: "Sandbox deletion via cloudrouter is managed by cmux",
    priority: 30,
  },
  {
    ruleId: "pdr_cloudrouter_stop",
    pattern: "Bash(cloudrouter stop:*)",
    description: "Sandbox lifecycle via cloudrouter is managed by cmux",
    priority: 30,
  },
  // Infrastructure - snapshot rebuilds affect all future sandboxes
  {
    ruleId: "pdr_gh_workflow_run",
    pattern: "Bash(gh workflow run:*)",
    description: "GitHub workflow triggers (like snapshot rebuilds) affect infrastructure and require human approval",
    priority: 40,
  },
];

/**
 * Seed system permission deny rules.
 * Idempotent - skips rules that already exist.
 */
export const seed = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();
    let created = 0;
    let skipped = 0;

    for (const rule of SYSTEM_DENY_RULES) {
      // Check if rule already exists
      const existing = await ctx.db
        .query("permissionDenyRules")
        .withIndex("by_ruleId", (q) => q.eq("ruleId", rule.ruleId))
        .first();

      if (existing) {
        skipped++;
        continue;
      }

      // Create the rule
      await ctx.db.insert("permissionDenyRules", {
        ruleId: rule.ruleId,
        pattern: rule.pattern,
        description: rule.description,
        scope: "system",
        teamId: undefined,
        projectFullName: undefined,
        // Only apply to task_sandbox - NOT cloud_workspace (head agents)
        contexts: ["task_sandbox"],
        enabled: true,
        priority: rule.priority,
        createdAt: now,
        updatedAt: now,
        createdBy: undefined, // System-generated
      });
      created++;
    }

    console.log(
      `[seedPermissionDenyRules] Created ${created} rules, skipped ${skipped} existing`,
    );
    return { created, skipped };
  },
});

/**
 * Clear all system permission deny rules.
 * Use with caution - for development/testing only.
 */
export const clearSystem = internalMutation({
  handler: async (ctx) => {
    const systemRules = await ctx.db
      .query("permissionDenyRules")
      .withIndex("by_scope", (q) => q.eq("scope", "system"))
      .collect();

    for (const rule of systemRules) {
      await ctx.db.delete(rule._id);
    }

    console.log(`[clearPermissionDenyRules] Deleted ${systemRules.length} system rules`);
    return { deleted: systemRules.length };
  },
});
