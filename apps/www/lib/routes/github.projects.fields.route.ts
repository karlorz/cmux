import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getAccessTokenFromRequest, getUserFromRequest } from "@/lib/utils/auth";
import { api } from "@cmux/convex/api";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getConvex } from "../utils/get-convex";
import { getProjectFields } from "../utils/github-projects";

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

async function getProjectFieldsViaGhCli(
  projectId: string,
): Promise<
  Array<{
    id: string;
    name: string;
    dataType: string;
    options?: Array<{ id: string; name: string }>;
  }>
> {
  if (!isGhCliFallbackEnabled()) return [];

  const query = `query($projectId:ID!){node(id:$projectId){... on ProjectV2{fields(first:50){nodes{... on ProjectV2Field{id name dataType} ... on ProjectV2SingleSelectField{id name dataType options{id name}} ... on ProjectV2IterationField{id name dataType}}}}}}`;

  try {
    const data = await runGhGraphql(query, { projectId });
    const node = data.node as
      | { fields?: { nodes?: Array<Record<string, unknown> | null> } }
      | undefined;
    const nodes = node?.fields?.nodes;
    if (!Array.isArray(nodes)) return [];

    return nodes
      .filter((field): field is Record<string, unknown> => Boolean(field))
      .map((field) => ({
        id: String(field.id ?? ""),
        name: String(field.name ?? ""),
        dataType: String(field.dataType ?? ""),
        options: Array.isArray(field.options)
          ? field.options
              .filter(
                (opt): opt is Record<string, unknown> => Boolean(opt),
              )
              .map((opt) => ({
                id: String(opt.id ?? ""),
                name: String(opt.name ?? ""),
              }))
              .filter((opt) => opt.id && opt.name)
          : undefined,
      }))
      .filter((field) => field.id && field.name && field.dataType);
  } catch (err) {
    console.warn(
      `[github.projects] gh CLI fields fallback failed for ${projectId}:`,
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

const ProjectFieldSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    dataType: z.string(),
    options: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  })
  .openapi("ProjectField");

const ProjectFieldsResponse = z
  .object({
    fields: z.array(ProjectFieldSchema),
  })
  .openapi("ProjectFieldsResponse");

export const githubProjectsFieldsRouter = new OpenAPIHono();

githubProjectsFieldsRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/integrations/github/projects/fields",
    tags: ["Integrations"],
    summary: "Get fields for a GitHub Project",
    request: {
      query: z.object({
        team: z.string().min(1),
        installationId: z.coerce.number(),
        projectId: z.string().min(1),
      }),
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: ProjectFieldsResponse } },
      },
      401: { description: "Unauthorized" },
      400: { description: "Bad request" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) return c.text("Unauthorized", 401);

    const { team, installationId, projectId } = c.req.valid("query");

    const convex = getConvex({ accessToken });
    const connections = await convex.query(api.github.listProviderConnections, {
      teamSlugOrId: team,
    });

    const target = connections.find(
      (co) => co.isActive && co.installationId === installationId,
    );

    if (!target) {
      return c.json({ fields: [] });
    }

    try {
      const userOAuthToken =
        target.accountType === "User"
          ? await getGitHubUserOAuthToken(c.req.raw, {
              scopes: [...GITHUB_PROJECT_SCOPES],
            })
          : undefined;

      if (target.accountType === "User" && !userOAuthToken) {
        const fallbackFields = await getProjectFieldsViaGhCli(projectId);
        if (fallbackFields.length > 0) {
          return c.json({ fields: fallbackFields });
        }
        return c.json({ fields: [] });
      }

      const fields = await getProjectFields(projectId, installationId, {
        userOAuthToken,
      });
      return c.json({ fields });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (target.accountType === "User") {
        const fallbackFields = await getProjectFieldsViaGhCli(projectId);
        if (fallbackFields.length > 0) {
          console.warn(
            `[github.projects] Primary project-fields API failed for ${projectId}, served via gh CLI fallback`,
          );
          return c.json({ fields: fallbackFields });
        }
      }
      console.error(
        `[github.projects] Failed to get fields for project ${projectId}:`,
        errMsg,
      );
      return c.json({ fields: [] });
    }
  },
);
