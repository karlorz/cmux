import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { resolveTeamIdLoose } from "../_shared/team";
import { authMutation, authQuery } from "./users/utils";

const scopeValidator = v.union(v.literal("global"), v.literal("workspace"));
const agentTypeValidator = v.union(v.literal("claude"), v.literal("codex"));

type AgentConfigScope = "global" | "workspace";
type AgentConfigType = "claude" | "codex";

function normalizeRequiredString(fieldName: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} is required`);
  }
  return trimmed;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeProjectFullNameForScope(
  scope: AgentConfigScope,
  projectFullName: string | undefined,
): string | undefined {
  if (scope === "global") {
    return undefined;
  }

  return normalizeRequiredString("projectFullName", projectFullName ?? "");
}

function validateJsonConfig(rawConfig: string): { isValid: boolean; error?: string } {
  try {
    const parsed = JSON.parse(rawConfig) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { isValid: false, error: "Config must be a JSON object" };
    }
    return { isValid: true };
  } catch (err) {
    return { isValid: false, error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function validateTomlConfig(rawConfig: string): { isValid: boolean; error?: string } {
  // Basic TOML syntax validation (checks for common errors)
  const lines = rawConfig.split("\n");
  let inMultilineString = false;
  let bracketDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    // Skip empty lines and comments
    if (!line || line.startsWith("#")) {
      continue;
    }

    // Track multiline strings
    const tripleQuotes = (line.match(/"""/g) ?? []).length;
    if (tripleQuotes % 2 === 1) {
      inMultilineString = !inMultilineString;
    }
    if (inMultilineString) {
      continue;
    }

    // Check for section headers
    if (line.startsWith("[")) {
      if (!line.endsWith("]")) {
        // Check if it ends with ] ignoring comments
        const withoutComment = line.split("#")[0].trim();
        if (!withoutComment.endsWith("]")) {
          return { isValid: false, error: `Line ${lineNum}: Unclosed section header` };
        }
      }
      bracketDepth++;
      continue;
    }

    // Check key-value pairs
    if (line.includes("=")) {
      const [key] = line.split("=", 2);
      if (!key || !key.trim()) {
        return { isValid: false, error: `Line ${lineNum}: Empty key before '='` };
      }
    }
  }

  if (inMultilineString) {
    return { isValid: false, error: "Unclosed multiline string" };
  }

  return { isValid: true };
}

function validateConfig(
  agentType: AgentConfigType,
  rawConfig: string,
): { isValid: boolean; error?: string } {
  if (!rawConfig.trim()) {
    return { isValid: true }; // Empty config is valid (will use defaults)
  }

  if (agentType === "claude") {
    return validateJsonConfig(rawConfig);
  }

  return validateTomlConfig(rawConfig);
}

async function findExistingConfig(
  ctx: MutationCtx,
  args: {
    teamId: string;
    agentType: AgentConfigType;
    scope: AgentConfigScope;
    projectFullName?: string;
  },
) {
  if (args.scope === "global") {
    return ctx.db
      .query("agentConfigs")
      .withIndex("by_team_agent_scope", (q) =>
        q.eq("teamId", args.teamId).eq("agentType", args.agentType).eq("scope", "global"),
      )
      .first();
  }

  const projectFullName = normalizeRequiredString(
    "projectFullName",
    args.projectFullName ?? "",
  );
  const configs = await ctx.db
    .query("agentConfigs")
    .withIndex("by_team_agent_scope", (q) =>
      q.eq("teamId", args.teamId).eq("agentType", args.agentType).eq("scope", "workspace"),
    )
    .collect();

  return configs.find((config) => config.projectFullName === projectFullName);
}

export const list = authQuery({
  args: {
    teamSlugOrId: v.string(),
    agentType: v.optional(agentTypeValidator),
    scope: v.optional(scopeValidator),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    let configs;
    if (args.agentType && args.scope) {
      configs = await ctx.db
        .query("agentConfigs")
        .withIndex("by_team_agent_scope", (q) =>
          q.eq("teamId", teamId).eq("agentType", args.agentType!).eq("scope", args.scope!),
        )
        .collect();
    } else if (args.agentType) {
      configs = await ctx.db
        .query("agentConfigs")
        .withIndex("by_team_agent", (q) =>
          q.eq("teamId", teamId).eq("agentType", args.agentType!),
        )
        .collect();
    } else {
      configs = await ctx.db
        .query("agentConfigs")
        .withIndex("by_team", (q) => q.eq("teamId", teamId))
        .collect();
    }

    return configs
      .filter((config) => {
        if (args.scope && config.scope !== args.scope) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.agentType !== b.agentType) {
          return a.agentType.localeCompare(b.agentType);
        }
        if (a.scope !== b.scope) {
          return a.scope.localeCompare(b.scope);
        }
        return (a.projectFullName ?? "").localeCompare(b.projectFullName ?? "");
      });
  },
});

export const get = authQuery({
  args: {
    teamSlugOrId: v.string(),
    agentType: agentTypeValidator,
    scope: scopeValidator,
    projectFullName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const projectFullName = normalizeOptionalString(args.projectFullName);

    if (args.scope === "global") {
      return ctx.db
        .query("agentConfigs")
        .withIndex("by_team_agent_scope", (q) =>
          q.eq("teamId", teamId).eq("agentType", args.agentType).eq("scope", "global"),
        )
        .first();
    }

    const configs = await ctx.db
      .query("agentConfigs")
      .withIndex("by_team_agent_scope", (q) =>
        q.eq("teamId", teamId).eq("agentType", args.agentType).eq("scope", "workspace"),
      )
      .collect();

    return configs.find((config) => config.projectFullName === projectFullName) ?? null;
  },
});

export const upsert = authMutation({
  args: {
    teamSlugOrId: v.string(),
    agentType: agentTypeValidator,
    scope: scopeValidator,
    projectFullName: v.optional(v.string()),
    rawConfig: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const now = Date.now();
    const projectFullName = normalizeProjectFullNameForScope(
      args.scope,
      args.projectFullName,
    );

    const validation = validateConfig(args.agentType, args.rawConfig);

    const existing = await findExistingConfig(ctx, {
      teamId,
      agentType: args.agentType,
      scope: args.scope,
      projectFullName,
    });

    if (existing) {
      await ctx.db.patch(existing._id, {
        rawConfig: args.rawConfig,
        isValid: validation.isValid,
        validationError: validation.error,
        updatedAt: now,
        userId,
      });
      return { id: existing._id, isValid: validation.isValid, validationError: validation.error };
    }

    const id = await ctx.db.insert("agentConfigs", {
      teamId,
      userId,
      agentType: args.agentType,
      scope: args.scope,
      projectFullName,
      rawConfig: args.rawConfig,
      isValid: validation.isValid,
      validationError: validation.error,
      createdAt: now,
      updatedAt: now,
    });

    return { id, isValid: validation.isValid, validationError: validation.error };
  },
});

export const remove = authMutation({
  args: {
    teamSlugOrId: v.string(),
    id: v.id("agentConfigs"),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const config = await ctx.db.get(args.id);

    if (!config) {
      throw new Error("Agent config not found");
    }

    if (config.teamId !== teamId) {
      throw new Error("Forbidden");
    }

    await ctx.db.delete(args.id);
    return { success: true };
  },
});

/**
 * Shared helper for fetching effective agent config (workspace overrides global).
 * Used by both public and internal queries.
 */
async function getEffectiveConfig(
  ctx: { db: QueryCtx["db"] },
  args: {
    teamId: string;
    agentType: AgentConfigType;
    projectFullName?: string;
  },
): Promise<string | null> {
  const projectFullName = normalizeOptionalString(args.projectFullName);

  // Get global config
  const globalConfig = await ctx.db
    .query("agentConfigs")
    .withIndex("by_team_agent_scope", (q) =>
      q.eq("teamId", args.teamId).eq("agentType", args.agentType).eq("scope", "global"),
    )
    .first();

  // Get workspace config if projectFullName is provided
  let workspaceConfig = null;
  if (projectFullName) {
    const workspaceConfigs = await ctx.db
      .query("agentConfigs")
      .withIndex("by_team_agent_scope", (q) =>
        q.eq("teamId", args.teamId).eq("agentType", args.agentType).eq("scope", "workspace"),
      )
      .collect();
    workspaceConfig = workspaceConfigs.find(
      (config) => config.projectFullName === projectFullName,
    );
  }

  // Workspace config takes precedence over global
  const effectiveConfig = workspaceConfig ?? globalConfig;

  if (!effectiveConfig || !effectiveConfig.isValid) {
    return null;
  }

  return effectiveConfig.rawConfig;
}

/**
 * Public query for sandbox agent config fetching (requires auth).
 * Returns merged config: workspace overrides global.
 */
export const getForSandbox = authQuery({
  args: {
    teamSlugOrId: v.string(),
    agentType: agentTypeValidator,
    projectFullName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    return getEffectiveConfig(ctx, {
      teamId,
      agentType: args.agentType,
      projectFullName: args.projectFullName,
    });
  },
});

/**
 * Internal query for sandbox agent config fetching (no auth required).
 * Used by worker/orchestration paths that already have validated teamId.
 * Returns merged config: workspace overrides global.
 */
export const getForSandboxInternal = internalQuery({
  args: {
    teamId: v.string(),
    agentType: agentTypeValidator,
    projectFullName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return getEffectiveConfig(ctx, {
      teamId: args.teamId,
      agentType: args.agentType,
      projectFullName: args.projectFullName,
    });
  },
});

/**
 * Get default template for an agent config type
 */
export const getDefaultTemplate = authQuery({
  args: {
    agentType: agentTypeValidator,
  },
  handler: async (_ctx, args) => {
    if (args.agentType === "claude") {
      return JSON.stringify(
        {
          mcpServers: {},
          permissions: { allow: [], deny: [] },
          settings: {},
        },
        null,
        2,
      );
    }

    // Codex TOML template
    return `# Custom Codex configuration
# Merged with cmux defaults at sandbox startup

[projects."/root/workspace"]
trust_level = "trusted"

# Add custom settings below
`;
  },
});
