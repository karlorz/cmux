import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getAccessTokenFromRequest, getUserFromRequest } from "@/lib/utils/auth";
import { api } from "@cmux/convex/api";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getConvex } from "../utils/get-convex";
import { listProjects } from "../utils/github-projects";

const GITHUB_PROJECT_SCOPES = ["project"] as const;
const execFileAsync = promisify(execFile);

async function getGitHubUserOAuthToken(
  req: Request,
  options?: { scopes?: string[] },
): Promise<string | undefined> {
  const user = await getUserFromRequest(req);
  if (!user) return undefined;

  try {
    const githubAccount = await user.getConnectedAccount("github", {
      or: "return-null",
      scopes: options?.scopes,
    });
    if (!githubAccount) return undefined;

    const tokenResult = await githubAccount.getAccessToken();
    const token = tokenResult.accessToken?.trim();
    return token || undefined;
  } catch (err) {
    console.error(
      "[github.projects] Failed to get user OAuth token:",
      err instanceof Error ? err.message : err,
    );
    return undefined;
  }
}

function isGhCliFallbackEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

function getGhCliEnv(): NodeJS.ProcessEnv {
  const ghEnv = { ...process.env };
  delete ghEnv.GH_TOKEN;
  delete ghEnv.GITHUB_TOKEN;
  delete ghEnv.GH_ENTERPRISE_TOKEN;
  delete ghEnv.GITHUB_ENTERPRISE_TOKEN;
  return ghEnv;
}

async function runGhGraphql(
  query: string,
  variables: Record<string, string | number | boolean | undefined>,
): Promise<Record<string, unknown>> {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [key, value] of Object.entries(variables)) {
    if (value === undefined) continue;
    args.push("-F", `${key}=${String(value)}`);
  }

  const { stdout } = await execFileAsync("gh", args, {
    env: getGhCliEnv(),
  });

  const parsed = JSON.parse(stdout) as {
    data?: Record<string, unknown>;
    errors?: Array<{ message?: string }>;
  };

  if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
    const msg = parsed.errors
      .map((err) => err.message)
      .filter(Boolean)
      .join("; ");
    throw new Error(msg || "gh graphql returned errors");
  }

  return parsed.data ?? {};
}

async function listProjectsViaGhCli(
  owner: string,
  ownerType: "user" | "organization",
  first = 20,
): Promise<
  Array<{
    id: string;
    title: string;
    number: number;
    url: string;
    shortDescription: string | null;
    closed: boolean;
    createdAt: string;
    updatedAt: string;
  }>
> {
  if (!isGhCliFallbackEnabled()) return [];

  const ownerNode = ownerType === "organization" ? "organization" : "user";
  const query = `query($login:String!,$first:Int!){${ownerNode}(login:$login){projectsV2(first:$first){nodes{id title number url shortDescription closed createdAt updatedAt}}}}`;

  try {
    const data = await runGhGraphql(query, {
      login: owner,
      first,
    });

    const parsed = data as {
      user?: { projectsV2?: { nodes?: Array<Record<string, unknown> | null> } };
      organization?: {
        projectsV2?: { nodes?: Array<Record<string, unknown> | null> };
      };
    };

    const nodes =
      ownerType === "organization"
        ? parsed.organization?.projectsV2?.nodes
        : parsed.user?.projectsV2?.nodes;

    if (!Array.isArray(nodes)) return [];

    return nodes
      .filter((node): node is Record<string, unknown> => Boolean(node))
      .map((node) => ({
        id: String(node.id ?? ""),
        title: String(node.title ?? ""),
        number: Number(node.number ?? 0),
        url: String(node.url ?? ""),
        shortDescription:
          typeof node.shortDescription === "string"
            ? node.shortDescription
            : null,
        closed: Boolean(node.closed),
        createdAt: String(node.createdAt ?? ""),
        updatedAt: String(node.updatedAt ?? ""),
      }))
      .filter((node) => node.id && node.title && node.url);
  } catch (err) {
    console.warn(
      "[github.projects] gh CLI fallback failed:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

const ListProjectsQuery = z
  .object({
    team: z.string().min(1).openapi({ description: "Team slug or UUID" }),
    installationId: z.coerce
      .number()
      .openapi({ description: "GitHub App installation ID" }),
    owner: z
      .string()
      .min(1)
      .optional()
      .openapi({
        description: "GitHub user or org login (optional, inferred from installation if omitted)",
      }),
    ownerType: z
      .enum(["user", "organization"])
      .optional()
      .openapi({ description: "Owner type" }),
  })
  .openapi("ListProjectsQuery");

const ProjectSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    number: z.number(),
    url: z.string(),
    shortDescription: z.string().nullable(),
    closed: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("GitHubProject");

const ProjectsResponse = z
  .object({
    projects: z.array(ProjectSchema),
    needsReauthorization: z.boolean().optional().openapi({
      description:
        "True if user needs to re-authorize GitHub with 'project' scope to see all projects",
    }),
  })
  .openapi("ProjectsResponse");

export const githubProjectsListRouter = new OpenAPIHono();

githubProjectsListRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/integrations/github/projects",
    tags: ["Integrations"],
    summary: "List GitHub Projects for a user or organization",
    request: { query: ListProjectsQuery },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: ProjectsResponse } },
      },
      401: { description: "Unauthorized" },
      400: { description: "Bad request" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) return c.text("Unauthorized", 401);

    const { team, installationId, owner: ownerInput, ownerType: ownerTypeInput } =
      c.req.valid("query");

    const convex = getConvex({ accessToken });
    const connections = await convex.query(api.github.listProviderConnections, {
      teamSlugOrId: team,
    });

    const target = connections.find(
      (co) => co.isActive && co.installationId === installationId,
    );

    if (!target) {
      return c.json({ projects: [] });
    }

    const owner = ownerInput ?? target.accountLogin ?? undefined;
    if (!owner) {
      console.warn(
        `[github.projects] No owner could be determined for installation ${installationId}`,
      );
      return c.json({ projects: [] });
    }

    const ownerType =
      ownerTypeInput ??
      (target.accountType === "Organization" ? "organization" : "user");

    let userOAuthToken: string | undefined;
    let needsReauthorization = false;

    try {
      if (ownerType === "user") {
        userOAuthToken = await getGitHubUserOAuthToken(c.req.raw, {
          scopes: [...GITHUB_PROJECT_SCOPES],
        });
        if (!userOAuthToken) {
          const fallbackProjects = await listProjectsViaGhCli(owner, ownerType);
          if (fallbackProjects.length > 0) {
            return c.json({
              projects: fallbackProjects,
              needsReauthorization: false,
            });
          }
          return c.json({
            projects: [],
            needsReauthorization: true,
          });
        }
      }

      const projects = await listProjects(owner, ownerType, installationId, {
        userOAuthToken,
      });
      return c.json({
        projects,
        needsReauthorization,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (ownerType === "user" && errMsg.includes("Resource not accessible")) {
        const fallbackProjects = await listProjectsViaGhCli(owner, ownerType);
        if (fallbackProjects.length > 0) {
          console.warn(
            `[github.projects] Primary user-project API failed for ${owner}, served via gh CLI fallback`,
          );
          return c.json({
            projects: fallbackProjects,
            needsReauthorization: false,
          });
        }
        needsReauthorization = true;
      }
      console.error(
        `[github.projects] Failed to list projects for ${owner}:`,
        errMsg,
      );
      return c.json({
        projects: [],
        needsReauthorization,
      });
    }
  },
);
