import { cookies } from "next/headers";

interface GitHubInstallation {
  id: number;
  account: {
    login: string;
    type: string;
  };
  repositories: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
  }>;
}

interface UserGitHubAccess {
  hasAccess: boolean;
  installationId?: number;
  isPrivate?: boolean;
  needsAuth: boolean;
}

/**
 * Check if the current user has access to a specific repository through GitHub App installations
 */
export async function checkUserRepoAccess(
  repoFullName: string
): Promise<UserGitHubAccess> {
  try {
    // Get user's stored GitHub installations from cookies or database
    // This is a simplified version - you'd typically fetch from your database
    const cookieStore = await cookies();
    const installationsData = cookieStore.get("github_installations");

    if (!installationsData) {
      return {
        hasAccess: false,
        needsAuth: true,
      };
    }

    const installations: GitHubInstallation[] = JSON.parse(installationsData.value);

    // Check if any installation has access to this repository
    for (const installation of installations) {
      const hasRepo = installation.repositories.some(
        (repo) => repo.full_name === repoFullName
      );

      if (hasRepo) {
        const repo = installation.repositories.find(
          (r) => r.full_name === repoFullName
        );

        return {
          hasAccess: true,
          installationId: installation.id,
          isPrivate: repo?.private,
          needsAuth: false,
        };
      }
    }

    // No installation has access to this repo
    return {
      hasAccess: false,
      needsAuth: true,
    };
  } catch (error) {
    console.error("Error checking user repo access:", error);
    return {
      hasAccess: false,
      needsAuth: true,
    };
  }
}

/**
 * Store user's GitHub installations in cookies (or database)
 * This should be called after successful GitHub App installation
 */
export async function storeUserInstallations(
  installations: GitHubInstallation[]
): Promise<void> {
  const cookieStore = await cookies();

  // Store in cookies with a reasonable expiry (e.g., 7 days)
  // In production, you'd store this in your database instead
  cookieStore.set("github_installations", JSON.stringify(installations), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

/**
 * Clear user's stored GitHub installations
 */
export async function clearUserInstallations(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete("github_installations");
}