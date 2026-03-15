/**
 * Permission Deny Rules - Convex Queries and Mutations
 *
 * Manages Claude Code permissions.deny patterns that restrict tool access.
 * These patterns are injected into /root/.claude/settings.json in sandboxes.
 *
 * Key difference from policy rules:
 * - Policy rules: Markdown text injected into CLAUDE.md instructions
 * - Permission deny rules: JSON patterns in settings.json permissions.deny
 */

import { v } from "convex/values";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { resolveTeamIdLoose } from "../_shared/team";
import { authMutation, authQuery } from "./users/utils";

// Validators
const scopeValidator = v.union(
  v.literal("system"),
  v.literal("team"),
  v.literal("workspace"),
);

const contextValidator = v.union(
  v.literal("task_sandbox"),
  v.literal("cloud_workspace"),
);

type PermissionContext = "task_sandbox" | "cloud_workspace";
type PermissionScope = "system" | "team" | "workspace";

// Scope priority (lower index = broader scope, later scopes can override)
const SCOPE_PRIORITY: PermissionScope[] = ["system", "team", "workspace"];

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
 * List all permission deny rules for a team (UI display).
 * Includes system rules and team/workspace-specific rules.
 */
export const list = authQuery({
  args: {
    teamSlugOrId: v.string(),
    scope: v.optional(scopeValidator),
    projectFullName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const projectFullName = normalizeOptionalString(args.projectFullName);

    // Get team rules
    let teamRules;
    if (args.scope) {
      teamRules = await ctx.db
        .query("permissionDenyRules")
        .withIndex("by_team_scope", (q) =>
          q.eq("teamId", teamId).eq("scope", args.scope!),
        )
        .collect();
    } else {
      teamRules = await ctx.db
        .query("permissionDenyRules")
        .withIndex("by_team", (q) => q.eq("teamId", teamId))
        .collect();
    }

    // Filter by projectFullName if provided
    if (projectFullName) {
      teamRules = teamRules.filter(
        (r) => r.scope !== "workspace" || r.projectFullName === projectFullName,
      );
    }

    // Get system rules (always visible)
    const systemRules = await ctx.db
      .query("permissionDenyRules")
      .withIndex("by_scope", (q) => q.eq("scope", "system"))
      .collect();

    // Combine and dedupe by ruleId (team/workspace override system)
    const ruleMap = new Map<string, (typeof systemRules)[number]>();
    for (const rule of systemRules) {
      ruleMap.set(rule.ruleId, rule);
    }
    for (const rule of teamRules) {
      ruleMap.set(rule.ruleId, rule);
    }

    return Array.from(ruleMap.values()).sort((a, b) => {
      // Sort by scope priority, then by priority number, then by pattern
      const scopeDiff =
        SCOPE_PRIORITY.indexOf(a.scope) - SCOPE_PRIORITY.indexOf(b.scope);
      if (scopeDiff !== 0) return scopeDiff;
      const priorityDiff = a.priority - b.priority;
      if (priorityDiff !== 0) return priorityDiff;
      return a.pattern.localeCompare(b.pattern);
    });
  },
});

/**
 * Get permission deny patterns for a sandbox spawn.
 * Returns string array of patterns for enabled rules matching the context.
 */
export const getForSandbox = authQuery({
  args: {
    teamSlugOrId: v.string(),
    context: contextValidator,
    projectFullName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    return await getForSandboxImpl(ctx, {
      teamId,
      context: args.context,
      projectFullName: normalizeOptionalString(args.projectFullName),
    });
  },
});

/**
 * Internal query for sandbox permission fetching (no auth required).
 * Used by worker/orchestration paths that already have validated teamId.
 */
export const getForSandboxInternal = internalQuery({
  args: {
    teamId: v.string(),
    context: contextValidator,
    projectFullName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await getForSandboxImpl(ctx, {
      teamId: args.teamId,
      context: args.context,
      projectFullName: normalizeOptionalString(args.projectFullName),
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
    context: PermissionContext;
    projectFullName?: string;
  },
): Promise<string[]> {
  // Fetch rules from each scope level
  const [systemRules, teamRules, workspaceRules] = await Promise.all([
    // System rules (always apply)
    ctx.db
      .query("permissionDenyRules")
      .withIndex("by_scope", (q) => q.eq("scope", "system").eq("enabled", true))
      .collect(),
    // Team rules
    ctx.db
      .query("permissionDenyRules")
      .withIndex("by_team_scope", (q) =>
        q.eq("teamId", args.teamId).eq("scope", "team").eq("enabled", true),
      )
      .collect(),
    // Workspace rules (if projectFullName provided)
    args.projectFullName
      ? ctx.db
          .query("permissionDenyRules")
          .withIndex("by_team_scope", (q) =>
            q.eq("teamId", args.teamId).eq("scope", "workspace").eq("enabled", true),
          )
          .collect()
          .then((rules) =>
            rules.filter((r) => r.projectFullName === args.projectFullName),
          )
      : Promise.resolve([]),
  ]);

  // Combine all rules
  const allRules = [...systemRules, ...teamRules, ...workspaceRules];

  // Filter by context
  const filteredRules = allRules.filter((rule) => {
    // Context filter: rule must include this context
    return rule.contexts.includes(args.context);
  });

  // Dedupe by ruleId, keeping the most specific scope
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

  // Sort by priority and return just the patterns
  return Array.from(ruleMap.values())
    .sort((a, b) => a.rule.priority - b.rule.priority)
    .map(({ rule }) => rule.pattern);
}

/**
 * Create or update a permission deny rule.
 */
export const upsert = authMutation({
  args: {
    id: v.optional(v.id("permissionDenyRules")), // Document ID for updates
    ruleId: v.optional(v.string()), // For creating with specific ruleId
    pattern: v.string(),
    description: v.string(),
    scope: scopeValidator,
    teamSlugOrId: v.optional(v.string()), // For team/workspace scope
    projectFullName: v.optional(v.string()), // For workspace scope
    contexts: v.array(contextValidator),
    enabled: v.optional(v.boolean()),
    priority: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const now = Date.now();

    // Resolve teamId for non-system scopes
    let teamId: string | undefined;
    if (args.scope !== "system" && args.teamSlugOrId) {
      teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    }

    const pattern = normalizeRequiredString("pattern", args.pattern);
    const description = normalizeRequiredString("description", args.description);
    const projectFullName = normalizeOptionalString(args.projectFullName);

    // Validate scope requirements
    if (args.scope === "team" && !teamId) {
      throw new Error("Team scope requires teamSlugOrId");
    }
    if (args.scope === "workspace" && (!projectFullName || !teamId)) {
      throw new Error("Workspace scope requires both teamSlugOrId and projectFullName");
    }

    // Update existing rule if document ID provided
    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing) {
        throw new Error("Permission deny rule not found");
      }

      // Prevent modifying system rules
      if (existing.scope === "system") {
        throw new Error("System rules cannot be modified");
      }

      await ctx.db.patch(args.id, {
        pattern,
        description,
        scope: args.scope,
        teamId: args.scope === "system" ? undefined : teamId,
        projectFullName: args.scope === "workspace" ? projectFullName : undefined,
        contexts: args.contexts,
        enabled: args.enabled ?? existing.enabled,
        priority: args.priority,
        updatedAt: now,
      });
      return args.id;
    }

    // Generate new ruleId if not provided
    const ruleId = args.ruleId ?? generateRuleId();

    // Create new rule
    return ctx.db.insert("permissionDenyRules", {
      ruleId,
      pattern,
      description,
      scope: args.scope,
      teamId: args.scope === "system" ? undefined : teamId,
      projectFullName: args.scope === "workspace" ? projectFullName : undefined,
      contexts: args.contexts,
      enabled: args.enabled ?? true,
      priority: args.priority,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    });
  },
});

/**
 * Toggle rule enabled status.
 */
export const updateEnabled = authMutation({
  args: {
    id: v.id("permissionDenyRules"),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const rule = await ctx.db.get(args.id);
    if (!rule) {
      throw new Error("Permission deny rule not found");
    }

    // System rules can be toggled but not modified otherwise
    await ctx.db.patch(args.id, {
      enabled: args.enabled,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Delete a permission deny rule.
 */
export const remove = authMutation({
  args: {
    id: v.id("permissionDenyRules"),
  },
  handler: async (ctx, args) => {
    const rule = await ctx.db.get(args.id);
    if (!rule) {
      throw new Error("Permission deny rule not found");
    }

    if (rule.scope === "system") {
      throw new Error("System rules cannot be deleted");
    }

    await ctx.db.delete(args.id);
    return { success: true };
  },
});

/**
 * Generate a new rule ID in the format "pdr_xxx".
 */
function generateRuleId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 12; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `pdr_${suffix}`;
}
