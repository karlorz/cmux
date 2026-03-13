/**
 * Seed script for initial system-level agent policy rules.
 * Run with: bunx convex run seedPolicyRules:seed --env-file ../../.env
 */

import { internalMutation } from "./_generated/server";

interface PolicyRuleSeed {
  ruleId: string;
  name: string;
  description: string;
  scope: "system";
  category: "git_policy" | "security" | "workflow" | "tool_restriction" | "custom";
  contexts: Array<"task_sandbox" | "cloud_workspace" | "local_dev">;
  ruleText: string;
  priority: number;
}

const SYSTEM_POLICY_RULES: PolicyRuleSeed[] = [
  // PR Creation Policy for Task Sandboxes
  {
    ruleId: "apr_git_no_pr_task_sandbox",
    name: "No Manual PR Creation (Task Sandbox)",
    description: "Prevents manual PR creation in task sandboxes - cmux handles PR creation automatically",
    scope: "system",
    category: "git_policy",
    contexts: ["task_sandbox"],
    ruleText: `**NO manual PR creation from task sandboxes** - cmux creates or updates the task PR automatically when you push to your feature branch. Do not run \`gh pr create\` or create PRs through the GitHub UI. Simply push your changes and cmux will handle the rest.`,
    priority: 10,
  },
  // PR Creation Policy for Cloud Workspaces
  {
    ruleId: "apr_git_pr_cloud_workspace",
    name: "Manual PR Creation Allowed (Cloud Workspace)",
    description: "Cloud workspaces (head agents) can create PRs manually",
    scope: "system",
    category: "git_policy",
    contexts: ["cloud_workspace"],
    ruleText: `**Manual PR creation allowed** - As a cloud workspace (head agent), you CAN create PRs manually using \`gh pr create --base main\`. You may also coordinate sub-agents to push changes that you then consolidate into a PR.`,
    priority: 10,
  },
  // Branch Policy
  {
    ruleId: "apr_git_no_direct_main",
    name: "No Direct Commits to Main",
    description: "Prevents direct commits to main/master branches",
    scope: "system",
    category: "git_policy",
    contexts: ["task_sandbox", "cloud_workspace", "local_dev"],
    ruleText: `**NO direct commits to main/master** - Always create a feature branch first using \`git checkout -b <type>/<description>\`. Push to feature branches only. Never force push to main/master.`,
    priority: 5,
  },
  // Merge Policy
  {
    ruleId: "apr_git_no_auto_merge",
    name: "No Auto-Merge Without Approval",
    description: "Requires explicit user approval before merging PRs",
    scope: "system",
    category: "git_policy",
    contexts: ["task_sandbox", "cloud_workspace"],
    ruleText: `**NO merging PRs without explicit user approval** - After creating a PR, STOP and wait for user approval. Only merge after the user explicitly says "merge", "approve", or similar confirmation.`,
    priority: 15,
  },
  // Security: No Credentials in Commits
  {
    ruleId: "apr_security_no_credentials",
    name: "No Credentials in Commits",
    description: "Prevents committing sensitive files",
    scope: "system",
    category: "security",
    contexts: ["task_sandbox", "cloud_workspace", "local_dev"],
    ruleText: `**Never commit credentials or secrets** - Do not commit \`.env\` files, API keys, tokens, passwords, or other sensitive data. Check \`git diff --staged\` before committing to ensure no secrets are included.`,
    priority: 1,
  },
];

/**
 * Seeds system-level policy rules. Safe to run multiple times - uses upsert logic.
 */
export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let inserted = 0;
    let updated = 0;

    for (const rule of SYSTEM_POLICY_RULES) {
      // Check if rule already exists
      const existing = await ctx.db
        .query("agentPolicyRules")
        .withIndex("by_scope", (q) => q.eq("scope", "system").eq("status", "active"))
        .filter((q) => q.eq(q.field("ruleId"), rule.ruleId))
        .first();

      if (existing) {
        // Update existing rule
        await ctx.db.patch(existing._id, {
          name: rule.name,
          description: rule.description,
          category: rule.category,
          contexts: rule.contexts,
          ruleText: rule.ruleText,
          priority: rule.priority,
          updatedAt: now,
        });
        updated++;
      } else {
        // Insert new rule
        await ctx.db.insert("agentPolicyRules", {
          ruleId: rule.ruleId,
          name: rule.name,
          description: rule.description,
          scope: "system",
          category: rule.category,
          contexts: rule.contexts,
          ruleText: rule.ruleText,
          priority: rule.priority,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        inserted++;
      }
    }

    console.log(`[seedPolicyRules] Seeded ${inserted} new rules, updated ${updated} existing rules`);
    return { inserted, updated, total: SYSTEM_POLICY_RULES.length };
  },
});
