import { v } from "convex/values";
import { authMutation, authQuery } from "./users/utils";

export const getUser = authQuery({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, { userId }) => {
    // Verify the requesting user matches or is admin
    if (ctx.identity.subject !== userId) {
      // For now, only allow users to query their own data
      throw new Error("Unauthorized: Can only query your own user data");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    return user;
  },
});

export const markOnboardingComplete = authMutation({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, { userId }) => {
    // Verify the requesting user matches
    if (ctx.identity.subject !== userId) {
      throw new Error("Unauthorized: Can only update your own user data");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(user._id, {
      hasCompletedOnboarding: true,
      onboardingCompletedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

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
