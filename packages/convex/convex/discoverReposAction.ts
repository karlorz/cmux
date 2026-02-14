"use node";

/**
 * Server-side repo discovery for custom environment tasks.
 *
 * When an agent completes in a custom environment (projectFullName starts with "env:"),
 * this action scans the sandbox workspace for git repos and stores them in discoveredRepos.
 * This enables the git diff UI to work immediately without waiting for client-side discovery.
 */

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  createMorphCloudClient,
  execInstanceInstanceIdExecPost,
} from "@cmux/morphcloud-openapi-client";
import { PveLxcClient } from "@cmux/pve-lxc-client";

function parseGitRemoteUrl(url: string): string | null {
  // Match GitHub HTTPS URLs: https://github.com/owner/repo.git or https://github.com/owner/repo
  const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/)?$/);
  if (httpsMatch) return `${httpsMatch[1]}/${httpsMatch[2]}`;
  // Match GitHub SSH URLs: git@github.com:owner/repo.git or git@github.com:owner/repo
  const sshMatch = url.match(/git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?(?:\/)?$/);
  if (sshMatch) return `${sshMatch[1]}/${sshMatch[2]}`;
  return null;
}

export const discoverRepos = internalAction({
  args: {
    runId: v.id("taskRuns"),
    sandboxId: v.string(),
  },
  handler: async (ctx, args) => {
    const workspacePath = "/root/workspace";
    const cmd = `for d in $(find "${workspacePath}" -maxdepth 3 -name ".git" -type d 2>/dev/null); do git -C "$(dirname "$d")" remote get-url origin 2>/dev/null; done`;

    try {
      let stdout: string;

      if (
        args.sandboxId.startsWith("pvelxc-") ||
        args.sandboxId.startsWith("cmux-")
      ) {
        stdout = await execPveLxc(args.sandboxId, cmd);
      } else {
        stdout = await execMorph(args.sandboxId, cmd);
      }

      const repos = parseRepos(stdout);
      if (repos.length > 0) {
        await ctx.runMutation(internal.taskRuns.updateDiscoveredReposInternal, {
          runId: args.runId,
          discoveredRepos: repos,
        });
        console.log("[discoverRepos] Found repos:", repos);
      } else {
        console.log("[discoverRepos] No repos found in workspace");
      }
    } catch (error) {
      console.error("[discoverRepos] Failed:", error);
      // Don't throw - discovery failure shouldn't block completion
    }
  },
});

async function execMorph(sandboxId: string, cmd: string): Promise<string> {
  const apiKey = process.env.MORPH_API_KEY;
  if (!apiKey) throw new Error("MORPH_API_KEY not set");

  const client = createMorphCloudClient({ auth: apiKey });
  const response = await execInstanceInstanceIdExecPost({
    client,
    path: { instance_id: sandboxId },
    body: { command: ["bash", "-c", cmd] },
  });
  return response.data?.stdout ?? "";
}

async function execPveLxc(sandboxId: string, cmd: string): Promise<string> {
  const apiUrl = process.env.PVE_API_URL;
  const apiToken = process.env.PVE_API_TOKEN;
  if (!apiUrl || !apiToken) {
    throw new Error("PVE_API_URL and PVE_API_TOKEN must be set");
  }

  const verifyTlsRaw = process.env.PVE_VERIFY_TLS;
  const verifyTls =
    verifyTlsRaw === "1" || verifyTlsRaw?.toLowerCase() === "true";

  const client = new PveLxcClient({
    apiUrl,
    apiToken,
    node: process.env.PVE_NODE,
    publicDomain: process.env.PVE_PUBLIC_DOMAIN,
    verifyTls,
  });

  const instance = await client.instances.get({ instanceId: sandboxId });
  const result = await instance.exec(cmd);
  if (result.exit_code !== 0 && !result.stdout.trim()) {
    throw new Error(result.stderr || `Command failed with exit ${result.exit_code}`);
  }
  return result.stdout;
}

function parseRepos(stdout: string): string[] {
  const repos = new Set<string>();
  for (const line of stdout.split("\n")) {
    const repo = parseGitRemoteUrl(line.trim());
    if (repo) repos.add(repo);
  }
  return Array.from(repos);
}
