import { v } from "convex/values";
import { resolveTeamIdLoose } from "../_shared/team";
import type { MutationCtx } from "./_generated/server";
import { authMutation, authQuery } from "./users/utils";

const scopeValidator = v.union(v.literal("global"), v.literal("workspace"));
const agentTypeValidator = v.union(
  v.literal("claude"),
  v.literal("codex"),
  v.literal("gemini"),
  v.literal("opencode"),
);

type McpConfigScope = "global" | "workspace";
type SandboxAgentType = "claude" | "codex" | "gemini" | "opencode";

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

function normalizeStringArray(values: string[] | undefined): string[] | undefined {
  if (!values) {
    return undefined;
  }

  const normalized = values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeRecord(
  record: Record<string, string> | undefined,
  fieldName: string,
): Record<string, string> | undefined {
  if (!record) {
    return undefined;
  }

  const normalizedEntries = Object.entries(record).map(([key, value]) => [
    normalizeRequiredString(`${fieldName} key`, key),
    value,
  ]);

  if (normalizedEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(normalizedEntries);
}

function normalizeProjectFullNameForScope(
  scope: McpConfigScope,
  projectFullName: string | undefined,
): string | undefined {
  if (scope === "global") {
    return undefined;
  }

  return normalizeRequiredString("projectFullName", projectFullName ?? "");
}

function getEnabledField(agentType: SandboxAgentType) {
  switch (agentType) {
    case "claude":
      return "enabledClaude";
    case "codex":
      return "enabledCodex";
    case "gemini":
      return "enabledGemini";
    case "opencode":
      return "enabledOpencode";
  }
}

function sortConfigsByUpdatedAt<T extends { updatedAt: number; _creationTime: number }>(
  configs: T[],
): T[] {
  return [...configs].sort(
    (a, b) => a.updatedAt - b.updatedAt || a._creationTime - b._creationTime,
  );
}

function dedupeConfigsByName<T extends { name: string; updatedAt: number; _creationTime: number }>(
  configs: T[],
): T[] {
  const deduped = new Map<string, T>();

  for (const config of sortConfigsByUpdatedAt(configs)) {
    deduped.set(config.name, config);
  }

  return Array.from(deduped.values());
}

async function findExistingConfig(
  ctx: MutationCtx,
  args: {
    teamId: string;
    scope: McpConfigScope;
    projectFullName?: string;
    name: string;
  },
) {
  if (args.scope === "global") {
    const configs = await ctx.db
      .query("mcpServerConfigs")
      .withIndex("by_team_scope", (q) =>
        q.eq("teamId", args.teamId).eq("scope", "global"),
      )
      .collect();

    return dedupeConfigsByName(configs).find((config) => config.name === args.name);
  }

  const projectFullName = normalizeRequiredString(
    "projectFullName",
    args.projectFullName ?? "",
  );
  const configs = await ctx.db
    .query("mcpServerConfigs")
    .withIndex("by_team_project", (q) =>
      q.eq("teamId", args.teamId).eq("projectFullName", projectFullName),
    )
    .collect();

  return dedupeConfigsByName(
    configs.filter((config) => config.scope === "workspace"),
  ).find((config) => config.name === args.name);
}

export const list = authQuery({
  args: {
    teamSlugOrId: v.string(),
    scope: v.optional(scopeValidator),
    projectFullName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const projectFullName = normalizeOptionalString(args.projectFullName);

    let configs;
    if (projectFullName) {
      configs = await ctx.db
        .query("mcpServerConfigs")
        .withIndex("by_team_project", (q) =>
          q.eq("teamId", teamId).eq("projectFullName", projectFullName),
        )
        .collect();
    } else if (args.scope) {
      const scope = args.scope;
      configs = await ctx.db
        .query("mcpServerConfigs")
        .withIndex("by_team_scope", (q) =>
          q.eq("teamId", teamId).eq("scope", scope),
        )
        .collect();
    } else {
      configs = await ctx.db
        .query("mcpServerConfigs")
        .withIndex("by_team", (q) => q.eq("teamId", teamId))
        .collect();
    }

    return configs
      .filter((config) => {
        if (args.scope && config.scope !== args.scope) {
          return false;
        }
        if (projectFullName && config.projectFullName !== projectFullName) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.scope !== b.scope) {
          return a.scope.localeCompare(b.scope);
        }
        if ((a.projectFullName ?? "") !== (b.projectFullName ?? "")) {
          return (a.projectFullName ?? "").localeCompare(b.projectFullName ?? "");
        }
        return a.name.localeCompare(b.name);
      });
  },
});

export const upsert = authMutation({
  args: {
    teamSlugOrId: v.string(),
    name: v.string(),
    displayName: v.string(),
    command: v.string(),
    args: v.array(v.string()),
    envVars: v.optional(v.record(v.string(), v.string())),
    description: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    enabledClaude: v.boolean(),
    enabledCodex: v.boolean(),
    enabledGemini: v.boolean(),
    enabledOpencode: v.boolean(),
    scope: scopeValidator,
    projectFullName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const now = Date.now();
    const scope = args.scope;
    const name = normalizeRequiredString("name", args.name);
    const displayName = normalizeRequiredString("displayName", args.displayName);
    const command = normalizeRequiredString("command", args.command);
    const normalizedArgs = normalizeStringArray(args.args) ?? [];
    const envVars = normalizeRecord(args.envVars, "envVars");
    const description = normalizeOptionalString(args.description);
    const tags = normalizeStringArray(args.tags);
    const projectFullName = normalizeProjectFullNameForScope(
      scope,
      args.projectFullName,
    );

    const existing = await findExistingConfig(ctx, {
      teamId,
      scope,
      projectFullName,
      name,
    });

    if (existing) {
      await ctx.db.patch(existing._id, {
        displayName,
        command,
        args: normalizedArgs,
        envVars,
        description,
        tags,
        enabledClaude: args.enabledClaude,
        enabledCodex: args.enabledCodex,
        enabledGemini: args.enabledGemini,
        enabledOpencode: args.enabledOpencode,
        updatedAt: now,
        userId,
      });
      return existing._id;
    }

    return ctx.db.insert("mcpServerConfigs", {
      teamId,
      userId,
      name,
      displayName,
      command,
      args: normalizedArgs,
      envVars,
      description,
      tags,
      enabledClaude: args.enabledClaude,
      enabledCodex: args.enabledCodex,
      enabledGemini: args.enabledGemini,
      enabledOpencode: args.enabledOpencode,
      scope,
      projectFullName,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const remove = authMutation({
  args: {
    teamSlugOrId: v.string(),
    id: v.id("mcpServerConfigs"),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const config = await ctx.db.get(args.id);

    if (!config) {
      throw new Error("MCP server config not found");
    }

    if (config.teamId !== teamId) {
      throw new Error("Forbidden");
    }

    await ctx.db.delete(args.id);
    return { success: true };
  },
});

export const getForSandbox = authQuery({
  args: {
    teamSlugOrId: v.string(),
    agentType: agentTypeValidator,
    projectFullName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const projectFullName = normalizeOptionalString(args.projectFullName);
    const enabledField = getEnabledField(args.agentType);

    const globalConfigs = dedupeConfigsByName(
      await ctx.db
        .query("mcpServerConfigs")
        .withIndex("by_team_scope", (q) =>
          q.eq("teamId", teamId).eq("scope", "global"),
        )
        .collect(),
    );

    const workspaceConfigs = projectFullName
      ? dedupeConfigsByName(
          (
            await ctx.db
              .query("mcpServerConfigs")
              .withIndex("by_team_project", (q) =>
                q.eq("teamId", teamId).eq("projectFullName", projectFullName),
              )
              .collect()
          ).filter((config) => config.scope === "workspace"),
        )
      : [];

    const mergedConfigs = new Map<string, (typeof globalConfigs)[number]>();
    for (const config of globalConfigs) {
      mergedConfigs.set(config.name, config);
    }
    for (const config of workspaceConfigs) {
      mergedConfigs.set(config.name, config);
    }

    return Array.from(mergedConfigs.values())
      .filter((config) => config[enabledField])
      .map((config) => ({
        name: config.name,
        command: config.command,
        args: config.args,
        envVars: config.envVars,
      }));
  },
});
