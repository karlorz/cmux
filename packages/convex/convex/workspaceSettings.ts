import { v } from "convex/values";
import { resolveTeamIdLoose } from "../_shared/team";
import { internalQuery } from "./_generated/server";
import { authMutation, authQuery } from "./users/utils";

const ENV_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

const randomSuffix = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

type LocalEnvVarInput = {
  id?: string;
  key: string;
  value: string;
};

type LocalEnvVarRecord = {
  id: string;
  key: string;
  value: string;
};

type LocalSetupCommandInput = {
  id?: string;
  command: string;
};

type LocalSetupCommandRecord = {
  id: string;
  command: string;
};

function normalizeEnvVars(
  input: LocalEnvVarInput[] | undefined
): LocalEnvVarRecord[] | undefined {
  if (!input) {
    return undefined;
  }

  const normalized: LocalEnvVarRecord[] = [];
  const seenKeys = new Map<string, number>();

  for (const raw of input) {
    const trimmedKey = raw.key?.trim();
    if (!trimmedKey) {
      continue;
    }
    if (!ENV_KEY_REGEX.test(trimmedKey)) {
      throw new Error(
        `Invalid environment variable name "${raw.key}". Use letters, numbers, and underscores (start with a letter or underscore).`
      );
    }

    const value =
      raw.value !== undefined && raw.value !== null ? raw.value : "";

    const record: LocalEnvVarRecord = {
      id: raw.id?.trim() || `env-${trimmedKey}-${randomSuffix()}`,
      key: trimmedKey,
      value,
    };

    if (seenKeys.has(trimmedKey)) {
      const index = seenKeys.get(trimmedKey)!;
      normalized[index] = record;
    } else {
      seenKeys.set(trimmedKey, normalized.length);
      normalized.push(record);
    }
  }

  return normalized.length > 0 ? normalized : [];
}

function normalizeSetupCommands(
  input: LocalSetupCommandInput[] | undefined
): LocalSetupCommandRecord[] | undefined {
  if (!input) {
    return undefined;
  }

  const normalized: LocalSetupCommandRecord[] = [];
  for (const raw of input) {
    const trimmed = raw.command?.trim();
    if (!trimmed) {
      continue;
    }
    normalized.push({
      id: raw.id?.trim() || `cmd-${randomSuffix()}`,
      command: trimmed,
    });
  }

  return normalized.length > 0 ? normalized : [];
}

export const get = authQuery({
  args: { teamSlugOrId: v.string() },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const settings = await ctx.db
      .query("workspaceSettings")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", teamId).eq("userId", userId)
      )
      .first();
    return settings ?? null;
  },
});

export const update = authMutation({
  args: {
    teamSlugOrId: v.string(),
    worktreePath: v.optional(v.string()),
    autoPrEnabled: v.optional(v.boolean()),
    localEnvVars: v.optional(
      v.array(
        v.object({
          id: v.optional(v.string()),
          key: v.string(),
          value: v.string(),
        })
      )
    ),
    localSetupCommands: v.optional(
      v.array(
        v.object({
          id: v.optional(v.string()),
          command: v.string(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const existing = await ctx.db
      .query("workspaceSettings")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", teamId).eq("userId", userId)
      )
      .first();
    const now = Date.now();
    const normalizedEnvVars = normalizeEnvVars(args.localEnvVars);
    const normalizedSetupCommands = normalizeSetupCommands(
      args.localSetupCommands
    );

    if (existing) {
      const updates: {
        worktreePath?: string;
        autoPrEnabled?: boolean;
        localEnvVars?: LocalEnvVarRecord[];
        localSetupCommands?: LocalSetupCommandRecord[];
        updatedAt: number;
      } = { updatedAt: now };

      if (args.worktreePath !== undefined) {
        updates.worktreePath = args.worktreePath;
      }
      if (args.autoPrEnabled !== undefined) {
        updates.autoPrEnabled = args.autoPrEnabled;
      }
      if (normalizedEnvVars !== undefined) {
        updates.localEnvVars =
          normalizedEnvVars.length > 0 ? normalizedEnvVars : undefined;
      }
      if (normalizedSetupCommands !== undefined) {
        updates.localSetupCommands =
          normalizedSetupCommands.length > 0
            ? normalizedSetupCommands
            : undefined;
      }

      await ctx.db.patch(existing._id, updates);
    } else {
      await ctx.db.insert("workspaceSettings", {
        worktreePath: args.worktreePath,
        autoPrEnabled: args.autoPrEnabled,
        localEnvVars:
          normalizedEnvVars && normalizedEnvVars.length > 0
            ? normalizedEnvVars
            : undefined,
        localSetupCommands:
          normalizedSetupCommands && normalizedSetupCommands.length > 0
            ? normalizedSetupCommands
            : undefined,
        nextLocalWorkspaceSequence: 0,
        createdAt: now,
        updatedAt: now,
        userId,
        teamId,
      });
    }
  },
});

export const getByTeamAndUserInternal = internalQuery({
  args: { teamId: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("workspaceSettings")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", args.teamId).eq("userId", args.userId)
      )
      .first();
    return settings ?? null;
  },
});
