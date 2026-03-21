import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { api } from "@cmux/convex/api";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getConvex } from "../utils/get-convex";
import { createDraftIssue } from "../utils/github-projects";

const GITHUB_PROJECT_SCOPES = ["project"] as const;

async function getGitHubUserOAuthToken(
  req: Request,
  options?: { scopes?: string[] },
): Promise<string | undefined> {
  const { getUserFromRequest } = await import("@/lib/utils/auth");
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
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

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

async function createDraftIssueViaGhCli(
  projectId: string,
  title: string,
  body?: string,
): Promise<string | null> {
  if (!isGhCliFallbackEnabled()) return null;

  const mutation = `mutation($projectId:ID!,$title:String!,$body:String){addProjectV2DraftIssue(input:{projectId:$projectId,title:$title,body:$body}){projectItem{id}}}`;

  try {
    const data = await runGhGraphql(mutation, {
      projectId,
      title,
      body,
    });
    const payload = data.addProjectV2DraftIssue as
      | { projectItem?: { id?: string } | null }
      | undefined;
    return payload?.projectItem?.id ?? null;
  } catch (err) {
    console.warn(
      `[github.projects] gh CLI draft fallback failed for ${projectId}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

const CreateDraftBody = z
  .object({
    projectId: z.string().openapi({ description: "GitHub Project node ID" }),
    title: z.string().min(1).openapi({ description: "Draft issue title" }),
    body: z.string().optional().openapi({ description: "Draft issue body" }),
  })
  .openapi("CreateDraftBody");

const BatchDraftItemSchema = z
  .object({
    title: z.string().min(1).openapi({ description: "Draft issue title" }),
    body: z.string().optional().openapi({ description: "Draft issue body" }),
  })
  .openapi("BatchDraftItem");

const CreateDraftBatchBody = z
  .object({
    projectId: z.string().openapi({ description: "GitHub Project node ID" }),
    items: z.array(BatchDraftItemSchema).min(1).max(50),
  })
  .openapi("CreateDraftBatchBody");

const ItemResponse = z
  .object({
    itemId: z.string().nullable(),
  })
  .openapi("ItemResponse");

const DraftBatchResultSchema = z
  .object({
    title: z.string(),
    itemId: z.string().nullable(),
    error: z.string().optional(),
  })
  .openapi("DraftBatchResult");

const DraftBatchResponse = z
  .object({
    results: z.array(DraftBatchResultSchema),
  })
  .openapi("DraftBatchResponse");

export const githubProjectsDraftsRouter = new OpenAPIHono();

githubProjectsDraftsRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/integrations/github/projects/drafts/batch",
    tags: ["Integrations"],
    summary: "Create multiple draft issues in a GitHub Project",
    request: {
      query: z.object({
        team: z.string().min(1),
        installationId: z.coerce.number(),
      }),
      body: {
        content: { "application/json": { schema: CreateDraftBatchBody } },
        required: true,
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: DraftBatchResponse } },
      },
      401: { description: "Unauthorized" },
      400: { description: "Bad request" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) return c.text("Unauthorized", 401);

    const { team, installationId } = c.req.valid("query");
    const { projectId, items } = c.req.valid("json");

    const convex = getConvex({ accessToken });
    const connections = await convex.query(api.github.listProviderConnections, {
      teamSlugOrId: team,
    });

    const target = connections.find(
      (co) => co.isActive && co.installationId === installationId,
    );

    if (!target) {
      return c.text("Installation not found", 400);
    }

    const userOAuthToken =
      target.accountType === "User"
        ? await getGitHubUserOAuthToken(c.req.raw, {
            scopes: [...GITHUB_PROJECT_SCOPES],
          })
        : undefined;

    const results: Array<{
      title: string;
      itemId: string | null;
      error?: string;
    }> = [];

    for (const item of items) {
      let itemId: string | null = null;
      let errorMessage: string | undefined;

      try {
        if (target.accountType !== "User" || userOAuthToken) {
          itemId = await createDraftIssue(
            projectId,
            item.title,
            item.body,
            installationId,
            { userOAuthToken },
          );
        }
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : String(err);
      }

      if (!itemId && target.accountType === "User") {
        itemId = await createDraftIssueViaGhCli(
          projectId,
          item.title,
          item.body,
        );
        if (!itemId && !errorMessage && !userOAuthToken) {
          errorMessage =
            "GitHub OAuth token is missing the required 'project' scope. Re-authorize GitHub and retry.";
        }
      }

      if (itemId) {
        results.push({ title: item.title, itemId });
      } else {
        if (errorMessage) {
          console.error(
            `[github.projects] Failed to create draft issue in batch (${item.title}):`,
            errorMessage,
          );
        }
        results.push({
          title: item.title,
          itemId: null,
          error: errorMessage ?? "Failed to create draft issue",
        });
      }
    }

    return c.json({ results });
  },
);

githubProjectsDraftsRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/integrations/github/projects/drafts",
    tags: ["Integrations"],
    summary: "Create a draft issue in a GitHub Project",
    request: {
      query: z.object({
        team: z.string().min(1),
        installationId: z.coerce.number(),
      }),
      body: {
        content: { "application/json": { schema: CreateDraftBody } },
        required: true,
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: ItemResponse } },
      },
      401: { description: "Unauthorized" },
      400: { description: "Bad request" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) return c.text("Unauthorized", 401);

    const { team, installationId } = c.req.valid("query");
    const { projectId, title, body } = c.req.valid("json");

    const convex = getConvex({ accessToken });
    const connections = await convex.query(api.github.listProviderConnections, {
      teamSlugOrId: team,
    });

    const target = connections.find(
      (co) => co.isActive && co.installationId === installationId,
    );

    if (!target) {
      return c.text("Installation not found", 400);
    }

    try {
      const userOAuthToken =
        target.accountType === "User"
          ? await getGitHubUserOAuthToken(c.req.raw, {
              scopes: [...GITHUB_PROJECT_SCOPES],
            })
          : undefined;

      if (target.accountType === "User" && !userOAuthToken) {
        const fallbackItemId = await createDraftIssueViaGhCli(
          projectId,
          title,
          body,
        );
        if (fallbackItemId) {
          return c.json({ itemId: fallbackItemId });
        }
        return c.json({ itemId: null });
      }

      const itemId = await createDraftIssue(
        projectId,
        title,
        body,
        installationId,
        { userOAuthToken },
      );
      return c.json({ itemId });
    } catch (err) {
      console.error(
        `[github.projects] Failed to create draft issue:`,
        err instanceof Error ? err.message : err,
      );
      if (target.accountType === "User") {
        const fallbackItemId = await createDraftIssueViaGhCli(
          projectId,
          title,
          body,
        );
        if (fallbackItemId) {
          return c.json({ itemId: fallbackItemId });
        }
      }
      return c.json({ itemId: null });
    }
  },
);
