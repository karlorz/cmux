import { getConvex } from "@/lib/utils/get-convex";
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
  const githubToken = process.env.OBSIDIAN_GITHUB_TOKEN;

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
        return {
          type: "github",
          githubOwner: vaultConfig.githubOwner,
          githubRepo: vaultConfig.githubRepo,
          githubPath: vaultConfig.githubPath || "",
          githubBranch: vaultConfig.githubBranch || "main",
          githubToken: process.env.OBSIDIAN_GITHUB_TOKEN,
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
