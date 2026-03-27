import { getConvex } from "@/lib/utils/get-convex";
import { generateGitHubInstallationToken } from "@/lib/utils/github-app-token";
import { api } from "@cmux/convex/api";
import {
  readVaultGitHub,
  readVaultLocal,
  type ObsidianNote,
} from "@cmux/shared/node/obsidian-reader";

export type VaultConfig = {
  type: "local" | "github";
  localPath?: string;
  githubOwner?: string;
  githubRepo?: string;
  githubPath?: string;
  githubBranch?: string;
  githubToken?: string;
} | null;

async function resolveVaultGithubToken({
  teamSlugOrId,
  accessToken,
  githubOwner,
  githubRepo,
}: {
  teamSlugOrId: string;
  accessToken: string;
  githubOwner: string;
  githubRepo: string;
}): Promise<string | undefined> {
  if (process.env.OBSIDIAN_GITHUB_TOKEN) {
    return process.env.OBSIDIAN_GITHUB_TOKEN;
  }

  try {
    const convex = getConvex({ accessToken });
    const connections = await convex.query(api.github.listProviderConnections, {
      teamSlugOrId,
    });

    const activeConnections = connections.filter((connection) => connection.isActive);
    const normalizedOwner = githubOwner.toLowerCase();
    const prioritizedConnections = [
      ...activeConnections.filter(
        (connection) => connection.accountLogin?.toLowerCase() === normalizedOwner,
      ),
      ...activeConnections.filter(
        (connection) => connection.accountLogin?.toLowerCase() !== normalizedOwner,
      ),
    ];

    for (const connection of prioritizedConnections) {
      try {
        const token = await generateGitHubInstallationToken({
          installationId: connection.installationId,
          repositories: [`${githubOwner}/${githubRepo}`],
          permissions: {
            contents: "read",
            metadata: "read",
          },
        });
        if (token) {
          return token;
        }
      } catch (error) {
        console.error("[vault] Failed to mint GitHub installation token:", error);
      }
    }
  } catch (error) {
    console.error("[vault] Failed to resolve GitHub provider connection:", error);
  }

  return undefined;
}

export async function getVaultConfig(
  teamSlugOrId: string,
  accessToken: string,
): Promise<VaultConfig> {
  const localPath = process.env.OBSIDIAN_VAULT_PATH;
  if (localPath) {
    return { type: "local", localPath };
  }

  const githubOwner = process.env.OBSIDIAN_GITHUB_OWNER;
  const githubRepo = process.env.OBSIDIAN_GITHUB_REPO;
  const githubPath = process.env.OBSIDIAN_GITHUB_PATH;
  const githubToken = githubOwner && githubRepo
    ? await resolveVaultGithubToken({
        teamSlugOrId,
        accessToken,
        githubOwner,
        githubRepo,
      })
    : undefined;

  if (githubOwner && githubRepo) {
    return {
      type: "github",
      githubOwner,
      githubRepo,
      githubPath: githubPath || "",
      githubBranch: process.env.OBSIDIAN_GITHUB_BRANCH || "main",
      githubToken,
    };
  }

  try {
    const convex = getConvex({ accessToken });
    const settings = await convex.query(api.workspaceSettings.get, { teamSlugOrId });

    if (settings?.vaultConfig) {
      const vaultConfig = settings.vaultConfig;
      if (vaultConfig.type === "local" && vaultConfig.localPath) {
        return { type: "local", localPath: vaultConfig.localPath };
      }
      if (vaultConfig.type === "github" && vaultConfig.githubOwner && vaultConfig.githubRepo) {
        const resolvedGithubToken = await resolveVaultGithubToken({
          teamSlugOrId,
          accessToken,
          githubOwner: vaultConfig.githubOwner,
          githubRepo: vaultConfig.githubRepo,
        });
        return {
          type: "github",
          githubOwner: vaultConfig.githubOwner,
          githubRepo: vaultConfig.githubRepo,
          githubPath: vaultConfig.githubPath || "",
          githubBranch: vaultConfig.githubBranch || "main",
          githubToken: resolvedGithubToken,
        };
      }
    }
  } catch (error) {
    console.error("[vault] Failed to fetch workspace settings:", error);
  }

  return null;
}

export async function readVault(config: VaultConfig): Promise<ObsidianNote[]> {
  if (!config) {
    return [];
  }

  if (config.type === "local" && config.localPath) {
    return readVaultLocal(config.localPath);
  }

  if (config.type === "github" && config.githubOwner && config.githubRepo && config.githubToken) {
    return readVaultGitHub({
      owner: config.githubOwner,
      repo: config.githubRepo,
      path: config.githubPath || "",
      token: config.githubToken,
      branch: config.githubBranch,
    });
  }

  return [];
}
