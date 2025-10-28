import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "octokit";
import { stackServerApp } from "@/lib/utils/stack";
import { storeUserInstallations } from "@/lib/github/user-installations";

// GitHub App configuration
const GITHUB_APP_ID = process.env.GITHUB_APP_ID;
const GITHUB_APP_PRIVATE_KEY = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n");
const GITHUB_APP_WEBHOOK_SECRET = process.env.GITHUB_APP_WEBHOOK_SECRET;

interface InstallationRequest {
  installationId: number;
  teamId?: string;
  repository?: string;
}

interface Repository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
}

export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const user = await stackServerApp.getUser({ or: "return-null" });
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Please sign in to continue" },
        { status: 401 }
      );
    }

    const body: InstallationRequest = await request.json();
    const { installationId, teamId, repository } = body;

    if (!installationId) {
      return NextResponse.json(
        { error: "Bad Request", message: "Installation ID is required" },
        { status: 400 }
      );
    }

    // Create an authenticated Octokit instance for the installation
    const octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN || undefined,
    });

    try {
      // Get installation details
      const { data: installation } = await octokit.request(
        "GET /app/installations/{installation_id}",
        {
          installation_id: installationId,
        }
      );

      // Get repositories accessible by this installation
      const { data: repoData } = await octokit.request(
        "GET /installation/repositories",
        {
          per_page: 100,
        }
      );

      const repositories: Repository[] = repoData.repositories.map((repo: any) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        private: repo.private,
      }));

      // Store the installation information in your database
      // This would typically involve calling a Convex mutation or your database
      // For now, we'll just verify and return the data

      // If a specific repository was requested, verify access
      if (repository) {
        const hasAccess = repositories.some((repo) => repo.full_name === repository);
        if (!hasAccess) {
          return NextResponse.json(
            {
              error: "Repository Access Denied",
              message: `The cmux-agent app does not have access to ${repository}. Please reinstall and grant access to this repository.`,
            },
            { status: 403 }
          );
        }
      }

      // Store user's GitHub installation info
      const account = installation.account;
      const login = account && 'login' in account ? account.login : (account && 'name' in account ? account.name : "");
      const type = account && 'type' in account ? account.type : "Organization";

      await storeUserInstallations([
        {
          id: installationId,
          account: {
            login: login || "",
            type: type || "",
          },
          repositories,
        },
      ]);

      return NextResponse.json({
        success: true,
        installationId,
        account: {
          login: login,
          type: type,
        },
        repositories,
        repositoryCount: repositories.length,
      });
    } catch (githubError: any) {
      console.error("GitHub API error:", githubError);

      // Check if it's a 404 (installation not found)
      if (githubError.status === 404) {
        return NextResponse.json(
          {
            error: "Installation Not Found",
            message: "The GitHub App installation was not found. Please try installing again.",
          },
          { status: 404 }
        );
      }

      // Check if it's a 403 (insufficient permissions)
      if (githubError.status === 403) {
        return NextResponse.json(
          {
            error: "Insufficient Permissions",
            message: "The GitHub App does not have sufficient permissions. Please reinstall with the correct permissions.",
          },
          { status: 403 }
        );
      }

      throw githubError;
    }
  } catch (error) {
    console.error("GitHub installation verification error:", error);
    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to verify GitHub installation",
      },
      { status: 500 }
    );
  }
}