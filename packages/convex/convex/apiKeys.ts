import { v } from "convex/values";
import { resolveTeamIdLoose } from "../_shared/team";
import { internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { authMutation, authQuery } from "./users/utils";
import {
  parseCodexAuthJson,
  getCodexTokenExpiresAtMs,
} from "@cmux/shared/providers/openai/codex-token";

type ApiKeyDoc = Doc<"apiKeys">;

function sortApiKeysByFreshness(apiKeys: ApiKeyDoc[]): ApiKeyDoc[] {
  return [...apiKeys].sort(
    (a, b) => a.updatedAt - b.updatedAt || a.createdAt - b.createdAt,
  );
}

function getLatestApiKeyByEnvVar(
  apiKeys: ApiKeyDoc[],
  envVar: string,
): ApiKeyDoc | null {
  return (
    sortApiKeysByFreshness(apiKeys)
      .filter((key) => key.envVar === envVar)
      .at(-1) ?? null
  );
}

function dedupeApiKeysByEnvVar(apiKeys: ApiKeyDoc[]): ApiKeyDoc[] {
  const deduped = new Map<string, ApiKeyDoc>();

  for (const key of sortApiKeysByFreshness(apiKeys)) {
    deduped.set(key.envVar, key);
  }

  return Array.from(deduped.values()).sort(
    (a, b) => a.updatedAt - b.updatedAt || a.createdAt - b.createdAt,
  );
}

function buildApiKeyMap(apiKeys: ApiKeyDoc[]): Record<string, string> {
  const keyMap: Record<string, string> = {};

  for (const key of sortApiKeysByFreshness(apiKeys)) {
    keyMap[key.envVar] = key.value;
  }

  return keyMap;
}

export const getAll = authQuery({
  args: { teamSlugOrId: v.string() },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const apiKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    return dedupeApiKeysByEnvVar(apiKeys);
  },
});

export const getByEnvVar = authQuery({
  args: {
    teamSlugOrId: v.string(),
    envVar: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const apiKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    return getLatestApiKeyByEnvVar(apiKeys, args.envVar);
  },
});

export const upsert = authMutation({
  args: {
    teamSlugOrId: v.string(),
    envVar: v.string(),
    value: v.string(),
    displayName: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const apiKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    const matchingKeys = sortApiKeysByFreshness(apiKeys).filter(
      (key) => key.envVar === args.envVar,
    );
    const existing = matchingKeys[matchingKeys.length - 1];

    // Extract token expiry for Codex OAuth tokens
    let tokenExpiresAt: number | undefined;
    if (args.envVar === "CODEX_AUTH_JSON") {
      const auth = parseCodexAuthJson(args.value);
      if (auth) {
        tokenExpiresAt = getCodexTokenExpiresAtMs(auth) ?? undefined;
      }
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        displayName: args.displayName,
        description: args.description,
        updatedAt: Date.now(),
        userId,
        // Update token tracking fields when user manually updates their token
        ...(args.envVar === "CODEX_AUTH_JSON"
          ? {
              tokenExpiresAt,
              lastRefreshError: undefined,
              refreshFailureCount: 0,
            }
        : {}),
      });
      if (matchingKeys.length > 1) {
        await Promise.all(
          matchingKeys
            .slice(0, -1)
            .map((duplicate) => ctx.db.delete(duplicate._id)),
        );
      }
      return existing._id;
    } else {
      return await ctx.db.insert("apiKeys", {
        envVar: args.envVar,
        value: args.value,
        displayName: args.displayName,
        description: args.description,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        userId,
        teamId,
        ...(args.envVar === "CODEX_AUTH_JSON" ? { tokenExpiresAt } : {}),
      });
    }
  },
});

export const remove = authMutation({
  args: {
    teamSlugOrId: v.string(),
    envVar: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const apiKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    const matchingKeys = sortApiKeysByFreshness(apiKeys).filter(
      (key) => key.envVar === args.envVar,
    );

    if (matchingKeys.length > 0) {
      await Promise.all(matchingKeys.map((key) => ctx.db.delete(key._id)));
    }
  },
});

export const getAllForAgents = authQuery({
  args: { teamSlugOrId: v.string() },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const apiKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    return buildApiKeyMap(apiKeys);
  },
});

export const getByEnvVarInternal = internalQuery({
  args: {
    teamId: v.string(),
    userId: v.string(),
    envVar: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("apiKeys")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", args.teamId).eq("userId", args.userId)
      )
      .filter((q) => q.eq(q.field("envVar"), args.envVar))
      .first();
  },
});

/**
 * Internal query to get all API keys for agents.
 * Used by background worker for internal spawns.
 */
export const getAllForAgentsInternal = internalQuery({
  args: {
    teamId: v.string(),
  },
  handler: async (ctx, args) => {
    const apiKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    return buildApiKeyMap(apiKeys);
  },
});
