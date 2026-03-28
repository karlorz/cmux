import { getConvex } from "@/lib/utils/get-convex";
import { generateGitHubInstallationToken } from "@/lib/utils/github-app-token";
import { api } from "@cmux/convex/api";
import {
  readVaultGitHub,
  readVaultLocal,
  type ObsidianNote,
} from "@cmux/shared/node/obsidian-reader";

const VAULT_GITHUB_PERMISSIONS = {
  contents: "read",
  metadata: "read",
} as const;

function buildGitHubVaultConfig(opts: {
  owner: string;
  repo: string;
  path?: string;
  branch?: string;
  token?: string;
}): VaultConfig {
  return {
    type: "github",
    githubOwner: opts.owner,
    githubRepo: opts.repo,
    githubPath: opts.path || "",
    githubBranch: opts.branch || "main",
    githubToken: opts.token,
  };
}

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

    const normalizedOwner = githubOwner.toLowerCase();
    const ownerMatches: typeof connections = [];
    const others: typeof connections = [];
    for (const connection of connections) {
      if (!connection.isActive) continue;
      if (connection.accountLogin?.toLowerCase() === normalizedOwner) {
        ownerMatches.push(connection);
      } else {
        others.push(connection);
      }
    }
    const prioritizedConnections = [...ownerMatches, ...others];

    for (const connection of prioritizedConnections) {
      try {
        const token = await generateGitHubInstallationToken({
          installationId: connection.installationId,
          repositories: [`${githubOwner}/${githubRepo}`],
          permissions: VAULT_GITHUB_PERMISSIONS,
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
    return buildGitHubVaultConfig({
      owner: githubOwner,
      repo: githubRepo,
      path: githubPath,
      branch: process.env.OBSIDIAN_GITHUB_BRANCH,
      token: githubToken,
    });
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
        return buildGitHubVaultConfig({
          owner: vaultConfig.githubOwner,
          repo: vaultConfig.githubRepo,
          path: vaultConfig.githubPath,
          branch: vaultConfig.githubBranch,
          token: resolvedGithubToken,
        });
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
