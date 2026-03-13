/**
 * Agent Policy Rules - Convex Queries and Mutations
 *
 * Centralized management of agent policy rules that apply to spawned sandboxes.
 * Follows scope hierarchy: system > team > workspace > user (most specific wins).
 */

import { v } from "convex/values";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { resolveTeamIdLoose } from "../_shared/team";
import { authMutation, authQuery } from "./users/utils";

// Validators for policy rule fields
const scopeValidator = v.union(
  v.literal("system"),
  v.literal("team"),
  v.literal("workspace"),
  v.literal("user"),
);

const contextValidator = v.union(
  v.literal("task_sandbox"),
  v.literal("cloud_workspace"),
  v.literal("local_dev"),
);

const categoryValidator = v.union(
  v.literal("git_policy"),
  v.literal("security"),
  v.literal("workflow"),
  v.literal("tool_restriction"),
  v.literal("custom"),
);

const statusValidator = v.union(
  v.literal("active"),
  v.literal("disabled"),
  v.literal("deprecated"),
);

const agentTypeValidator = v.union(
  v.literal("claude"),
  v.literal("codex"),
  v.literal("gemini"),
  v.literal("opencode"),
);

type AgentType = "claude" | "codex" | "gemini" | "opencode";
type PolicyContext = "task_sandbox" | "cloud_workspace" | "local_dev";
type PolicyScope = "system" | "team" | "workspace" | "user";

// Scope priority for merging (lower index = broader scope, later scopes override)
const SCOPE_PRIORITY: PolicyScope[] = ["system", "team", "workspace", "user"];

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeRequiredString(fieldName: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} is required`);
  }
  return trimmed;
}

/**
 * List policy rules for a team (UI display).
 */
export const list = authQuery({
  args: {
    teamSlugOrId: v.string(),
    scope: v.optional(scopeValidator),
    projectFullName: v.optional(v.string()),
    status: v.optional(statusValidator),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const projectFullName = normalizeOptionalString(args.projectFullName);

    // Get all relevant rules
    let rules;
    if (projectFullName) {
      rules = await ctx.db
        .query("agentPolicyRules")
        .withIndex("by_project", (q) =>
          q.eq("projectFullName", projectFullName).eq("status", args.status ?? "active"),
        )
        .collect();
    } else if (args.scope) {
      rules = await ctx.db
        .query("agentPolicyRules")
        .withIndex("by_team_scope", (q) =>
          q
            .eq("teamId", teamId)
            .eq("scope", args.scope!)
            .eq("status", args.status ?? "active"),
        )
        .collect();
    } else {
      rules = await ctx.db
        .query("agentPolicyRules")
        .withIndex("by_team", (q) =>
          q.eq("teamId", teamId).eq("status", args.status ?? "active"),
        )
        .collect();
    }

    // Also include system rules (always visible)
    const systemRules = await ctx.db
      .query("agentPolicyRules")
      .withIndex("by_scope", (q) =>
        q.eq("scope", "system").eq("status", args.status ?? "active"),
      )
      .collect();

    // Combine and dedupe (team rules override system rules with same ruleId)
    const ruleMap = new Map<string, (typeof rules)[number]>();
    for (const rule of systemRules) {
      ruleMap.set(rule.ruleId, rule);
    }
    for (const rule of rules) {
      ruleMap.set(rule.ruleId, rule);
    }

    return Array.from(ruleMap.values()).sort((a, b) => {
      // Sort by scope priority, then by priority number, then by name
      const scopeDiff =
        SCOPE_PRIORITY.indexOf(a.scope) - SCOPE_PRIORITY.indexOf(b.scope);
      if (scopeDiff !== 0) return scopeDiff;
      const priorityDiff = a.priority - b.priority;
      if (priorityDiff !== 0) return priorityDiff;
      return a.name.localeCompare(b.name);
    });
  },
});

/**
 * Get policy rules for a sandbox spawn (filtered by agent type, context).
 * Returns rules merged by scope hierarchy with deduplication.
 */
export const getForSandbox = authQuery({
  args: {
    teamSlugOrId: v.string(),
    agentType: agentTypeValidator,
    projectFullName: v.optional(v.string()),
    context: contextValidator,
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;
    return await getForSandboxImpl(ctx, {
      teamId,
      userId,
      agentType: args.agentType,
      projectFullName: normalizeOptionalString(args.projectFullName),
      context: args.context,
    });
  },
});

/**
 * Internal query for sandbox policy fetching (no auth required).
 * Used by worker/orchestration paths that already have validated teamId.
 */
export const getForSandboxInternal = internalQuery({
  args: {
    teamId: v.string(),
    userId: v.optional(v.string()),
    agentType: agentTypeValidator,
    projectFullName: v.optional(v.string()),
    context: contextValidator,
  },
  handler: async (ctx, args) => {
    return await getForSandboxImpl(ctx, {
      teamId: args.teamId,
      userId: args.userId,
      agentType: args.agentType,
      projectFullName: normalizeOptionalString(args.projectFullName),
      context: args.context,
    });
  },
});

/**
 * Shared implementation for getForSandbox queries.
 */
async function getForSandboxImpl(
  ctx: QueryCtx,
  args: {
    teamId: string;
    userId?: string;
    agentType: AgentType;
    projectFullName?: string;
    context: PolicyContext;
  },
) {
  // Fetch rules from each scope level
  const [systemRules, teamRules, workspaceRules, userRules] = await Promise.all([
    // System rules (always apply)
    ctx.db
      .query("agentPolicyRules")
      .withIndex("by_scope", (q) => q.eq("scope", "system").eq("status", "active"))
      .collect(),
    // Team rules
    ctx.db
      .query("agentPolicyRules")
      .withIndex("by_team_scope", (q) =>
        q.eq("teamId", args.teamId).eq("scope", "team").eq("status", "active"),
      )
      .collect(),
    // Workspace rules (if projectFullName provided)
    args.projectFullName
      ? ctx.db
          .query("agentPolicyRules")
          .withIndex("by_project", (q) =>
            q.eq("projectFullName", args.projectFullName).eq("status", "active"),
          )
          .collect()
          .then((rules) => rules.filter((r) => r.scope === "workspace"))
      : Promise.resolve([]),
    // User rules (if userId provided)
    args.userId
      ? ctx.db
          .query("agentPolicyRules")
          .withIndex("by_user", (q) =>
            q.eq("userId", args.userId).eq("status", "active"),
          )
          .collect()
      : Promise.resolve([]),
  ]);

  // Combine all rules
  const allRules = [...systemRules, ...teamRules, ...workspaceRules, ...userRules];

  // Filter by agent type and context
  const filteredRules = allRules.filter((rule) => {
    // Agent filter: if agents array is set, agent must be included
    if (rule.agents && rule.agents.length > 0) {
      if (!rule.agents.includes(args.agentType)) {
        return false;
      }
    }

    // Context filter: if contexts array is set, context must be included
    if (rule.contexts && rule.contexts.length > 0) {
      if (!rule.contexts.includes(args.context)) {
        return false;
      }
    }

    return true;
  });

  // Dedupe by ruleId, keeping the most specific scope
  // Within same scope, keep the one with lowest priority number
  const ruleMap = new Map<
    string,
    { rule: (typeof filteredRules)[number]; scopeIndex: number }
  >();

  for (const rule of filteredRules) {
    const scopeIndex = SCOPE_PRIORITY.indexOf(rule.scope);
    const existing = ruleMap.get(rule.ruleId);

    if (!existing) {
      ruleMap.set(rule.ruleId, { rule, scopeIndex });
    } else if (scopeIndex > existing.scopeIndex) {
      // More specific scope wins
      ruleMap.set(rule.ruleId, { rule, scopeIndex });
    } else if (
      scopeIndex === existing.scopeIndex &&
      rule.priority < existing.rule.priority
    ) {
      // Same scope, lower priority number wins
      ruleMap.set(rule.ruleId, { rule, scopeIndex });
    }
  }

  // Sort by priority within each category
  const result = Array.from(ruleMap.values())
    .map(({ rule }) => ({
      ruleId: rule.ruleId,
      name: rule.name,
      category: rule.category,
      ruleText: rule.ruleText,
      priority: rule.priority,
      scope: rule.scope,
    }))
    .sort((a, b) => {
      // Sort by category, then priority
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.priority - b.priority;
    });

  return result;
}

/**
 * Create or update a policy rule.
 */
export const upsert = authMutation({
  args: {
    ruleId: v.optional(v.string()), // If provided, updates existing rule
    name: v.string(),
    description: v.optional(v.string()),
    scope: scopeValidator,
    teamSlugOrId: v.optional(v.string()), // For team/workspace/user scope
    projectFullName: v.optional(v.string()), // For workspace scope
    agents: v.optional(v.array(agentTypeValidator)),
    contexts: v.optional(v.array(contextValidator)),
    category: categoryValidator,
    ruleText: v.string(),
    priority: v.number(),
    status: v.optional(statusValidator),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const now = Date.now();

    // Resolve teamId for non-system scopes
    let teamId: string | undefined;
    if (args.scope !== "system" && args.teamSlugOrId) {
      teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    }

    const name = normalizeRequiredString("name", args.name);
    const ruleText = normalizeRequiredString("ruleText", args.ruleText);
    const description = normalizeOptionalString(args.description);
    const projectFullName = normalizeOptionalString(args.projectFullName);

    // Validate scope requirements
    if (args.scope === "team" && !teamId) {
      throw new Error("Team scope requires teamSlugOrId");
    }
    if (args.scope === "workspace" && !projectFullName) {
      throw new Error("Workspace scope requires projectFullName");
    }
    if (args.scope === "user" && !teamId) {
      throw new Error("User scope requires teamSlugOrId");
    }

    // Check for existing rule if ruleId provided
    if (args.ruleId) {
      const existingRules = await ctx.db
        .query("agentPolicyRules")
        .filter((q) => q.eq(q.field("ruleId"), args.ruleId))
        .collect();
      const existing = existingRules[0];

      if (existing) {
        // Update existing rule
        await ctx.db.patch(existing._id, {
          name,
          description,
          scope: args.scope,
          teamId: args.scope === "system" ? undefined : teamId,
          projectFullName: args.scope === "workspace" ? projectFullName : undefined,
          userId: args.scope === "user" ? userId : undefined,
          agents: args.agents,
          contexts: args.contexts,
          category: args.category,
          ruleText,
          priority: args.priority,
          status: args.status ?? existing.status,
          updatedAt: now,
        });
        return existing._id;
      }
    }

    // Generate new ruleId if not provided or not found
    const ruleId = args.ruleId ?? generateRuleId();

    // Create new rule
    return ctx.db.insert("agentPolicyRules", {
      ruleId,
      name,
      description,
      scope: args.scope,
      teamId: args.scope === "system" ? undefined : teamId,
      projectFullName: args.scope === "workspace" ? projectFullName : undefined,
      userId: args.scope === "user" ? userId : undefined,
      agents: args.agents,
      contexts: args.contexts,
      category: args.category,
      ruleText,
      priority: args.priority,
      status: args.status ?? "active",
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    });
  },
});

/**
 * Delete a policy rule.
 */
export const remove = authMutation({
  args: {
    id: v.id("agentPolicyRules"),
  },
  handler: async (ctx, args) => {
    const rule = await ctx.db.get(args.id);
    if (!rule) {
      throw new Error("Policy rule not found");
    }

    // System rules can only be deleted by admin (TODO: add admin check)
    if (rule.scope === "system") {
      throw new Error("System rules cannot be deleted");
    }

    await ctx.db.delete(args.id);
    return { success: true };
  },
});

/**
 * Update rule status (enable/disable/deprecate).
 */
export const updateStatus = authMutation({
  args: {
    id: v.id("agentPolicyRules"),
    status: statusValidator,
  },
  handler: async (ctx, args) => {
    const rule = await ctx.db.get(args.id);
    if (!rule) {
      throw new Error("Policy rule not found");
    }

    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Generate a new rule ID in the format "apr_xxx".
 */
function generateRuleId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 12; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `apr_${suffix}`;
}
