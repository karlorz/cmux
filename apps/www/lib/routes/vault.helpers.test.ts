import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const generateGitHubInstallationTokenMock = vi.fn();

vi.mock("@/lib/utils/get-convex", () => ({
  getConvex: vi.fn(() => ({
    query: queryMock,
  })),
}));

vi.mock("@/lib/utils/github-app-token", () => ({
  generateGitHubInstallationToken: (...args: unknown[]) =>
    generateGitHubInstallationTokenMock(...args),
}));

import { getVaultConfig } from "./vault.helpers";

describe("vault.helpers", () => {
  beforeEach(() => {
    queryMock.mockReset();
    generateGitHubInstallationTokenMock.mockReset();

    delete process.env.OBSIDIAN_GITHUB_OWNER;
    delete process.env.OBSIDIAN_GITHUB_REPO;
    delete process.env.OBSIDIAN_GITHUB_PATH;
    delete process.env.OBSIDIAN_GITHUB_BRANCH;
    delete process.env.OBSIDIAN_GITHUB_TOKEN;
    delete process.env.OBSIDIAN_VAULT_PATH;
  });

  it("resolves a GitHub App installation token for team-configured GitHub vaults", async () => {
    queryMock
      .mockResolvedValueOnce({
        vaultConfig: {
          type: "github",
          githubOwner: "karlorz",
          githubRepo: "obsidian_vault",
          githubBranch: "main",
        },
      })
      .mockResolvedValueOnce([
        {
          installationId: 123,
          accountLogin: "karlorz",
          isActive: true,
        },
        {
          installationId: 456,
          accountLogin: "someone-else",
          isActive: true,
        },
      ]);
    generateGitHubInstallationTokenMock.mockResolvedValue("ghs_installation_token");

    const config = await getVaultConfig("dev", "stack-access-token");

    expect(config).toEqual({
      type: "github",
      githubOwner: "karlorz",
      githubRepo: "obsidian_vault",
      githubPath: "",
      githubBranch: "main",
      githubToken: "ghs_installation_token",
    });
    expect(generateGitHubInstallationTokenMock).toHaveBeenCalledTimes(1);
    expect(generateGitHubInstallationTokenMock).toHaveBeenCalledWith({
      installationId: 123,
      repositories: ["karlorz/obsidian_vault"],
      permissions: {
        contents: "read",
        metadata: "read",
      },
    });
  });
});
