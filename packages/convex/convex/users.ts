import { authQuery } from "./users/utils";
import { internalQuery } from "./_generated/server";

export const getCurrentBasic = authQuery({
  // No args needed; uses auth context
  args: {},
  handler: async (ctx) => {
    const userId = ctx.identity.subject;

    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    const displayName = user?.displayName ?? ctx.identity.name ?? null;
    const primaryEmail =
      user?.primaryEmail ??
      ((ctx.identity as unknown as { email?: string } | null)?.email ?? null);

    // Try to surface a GitHub account id for anonymous noreply construction
    type OAuthProvider = { id: string; accountId: string; email?: string };
    const isOAuthProvider = (obj: unknown): obj is OAuthProvider => {
      if (typeof obj !== "object" || obj === null) return false;
      const o = obj as Record<string, unknown>;
      const idOk = typeof o.id === "string";
      const acctOk = typeof o.accountId === "string";
      const emailOk =
        o.email === undefined || typeof o.email === "string";
      return idOk && acctOk && emailOk;
    };

    let githubAccountId: string | null = null;
    if (Array.isArray(user?.oauthProviders)) {
      for (const prov of user!.oauthProviders as unknown[]) {
        if (isOAuthProvider(prov) && prov.id.toLowerCase().includes("github")) {
          githubAccountId = prov.accountId;
          break;
        }
      }
    }

    return {
      userId,
      displayName,
      primaryEmail,
      githubAccountId,
    };
  },
});

// Internal query to get current user ID from auth context (for server-side use)
export const getCurrentUserIdInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    return identity.subject;
  },
});
