import { stackServerAppJs } from "@/lib/utils/stack";
import { z } from "@hono/zod-openapi";

export const RefreshGitHubAuthBody = z
  .object({
    teamSlugOrId: z.string(),
  })
  .openapi("RefreshGitHubAuthBody");

export const RefreshGitHubAuthResponse = z
  .object({
    refreshed: z.literal(true),
  })
  .openapi("RefreshGitHubAuthResponse");

/**
 * Fetches a fresh GitHub access token for the authenticated user.
 * This is a reusable helper to avoid duplicating token retrieval logic.
 */
export async function getFreshGitHubToken(
  user: Awaited<ReturnType<typeof stackServerAppJs.getUser>>
): Promise<{ token: string } | { error: string; status: 401 }> {
  if (!user) {
    return { error: "Unauthorized", status: 401 };
  }

  const githubAccount = await user.getConnectedAccount("github");
  if (!githubAccount) {
    return { error: "GitHub account not connected", status: 401 };
  }

  const { accessToken: githubAccessToken } =
    await githubAccount.getAccessToken();
  if (!githubAccessToken) {
    return { error: "Failed to get GitHub access token", status: 401 };
  }

  return { token: githubAccessToken };
}
