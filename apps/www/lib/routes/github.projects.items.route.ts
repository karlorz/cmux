import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getAccessTokenFromRequest, getUserFromRequest } from "@/lib/utils/auth";
import { api } from "@cmux/convex/api";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getConvex } from "../utils/get-convex";
import { getProjectItems } from "../utils/github-projects";

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

async function getProjectItemsViaGhCli(
  projectId: string,
  first = 50,
  after?: string,
): Promise<{
  items: Array<{
    id: string;
    contentType: string;
    title: string;
    status: string | null;
    url: string | null;
    labels: string[];
    fieldValues: Record<string, string | number | null>;
  }>;
  hasNextPage: boolean;
  endCursor: string | null;
}> {
  if (!isGhCliFallbackEnabled()) {
    return { items: [], hasNextPage: false, endCursor: null };
  }

  const query = `query($projectId:ID!,$first:Int!,$after:String){node(id:$projectId){... on ProjectV2{items(first:$first,after:$after){nodes{id content{... on Issue{id title number state url labels(first:20){nodes{name}}} ... on PullRequest{id title number state url labels(first:20){nodes{name}}} ... on DraftIssue{id title body}} fieldValues(first:20){nodes{... on ProjectV2ItemFieldTextValue{text field{... on ProjectV2Field{name}}} ... on ProjectV2ItemFieldNumberValue{number field{... on ProjectV2Field{name}}} ... on ProjectV2ItemFieldDateValue{date field{... on ProjectV2Field{name}}} ... on ProjectV2ItemFieldSingleSelectValue{name field{... on ProjectV2SingleSelectField{name}}} ... on ProjectV2ItemFieldIterationValue{title field{... on ProjectV2IterationField{name}}}}}} pageInfo{hasNextPage endCursor}}}}}`;

  try {
    const data = await runGhGraphql(query, { projectId, first, after });
    const node = data.node as
      | {
          items?: {
            nodes?: Array<Record<string, unknown> | null>;
            pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
          };
        }
      | undefined;
    const rawNodes = node?.items?.nodes;
    const pageInfo = node?.items?.pageInfo;
    if (!Array.isArray(rawNodes)) {
      return { items: [], hasNextPage: false, endCursor: null };
    }

    const items = rawNodes
      .filter((n): n is Record<string, unknown> => Boolean(n))
      .map((n) => {
        const content = n.content as Record<string, unknown> | null;
        const fieldValuesObj = n.fieldValues as
          | { nodes?: Array<Record<string, unknown> | null> }
          | undefined;

        let contentType = "DraftIssue";
        if (content && "state" in content && "url" in content) {
          const urlStr = String(content.url ?? "");
          contentType = urlStr.includes("/pull/") ? "PullRequest" : "Issue";
        }

        const fieldValues: Record<string, string | number | null> = {};
        for (const fv of fieldValuesObj?.nodes ?? []) {
          if (!fv) continue;
          const field = fv.field as { name?: string } | undefined;
          const fieldName = field?.name;
          if (!fieldName) continue;
          if (typeof fv.text === "string") fieldValues[fieldName] = fv.text;
          else if (typeof fv.number === "number") fieldValues[fieldName] = fv.number;
          else if (typeof fv.date === "string") fieldValues[fieldName] = fv.date;
          else if (typeof fv.name === "string") fieldValues[fieldName] = fv.name;
          else if (typeof fv.title === "string") fieldValues[fieldName] = fv.title;
        }

        const labelsObj = content?.labels as
          | { nodes?: Array<Record<string, unknown> | null> }
          | undefined;
        const labels = Array.isArray(labelsObj?.nodes)
          ? labelsObj.nodes
              .filter((label): label is Record<string, unknown> => Boolean(label))
              .map((label) => String(label.name ?? "").trim())
              .filter((label) => label.length > 0)
          : [];

        return {
          id: String(n.id ?? ""),
          contentType,
          title: content ? String((content.title as string) ?? "") : "",
          status: typeof fieldValues.Status === "string" ? fieldValues.Status : null,
          url: content && typeof content.url === "string" ? content.url : null,
          labels,
          fieldValues,
        };
      })
      .filter((item) => item.id && item.title);

    return {
      items,
      hasNextPage: pageInfo?.hasNextPage ?? false,
      endCursor: pageInfo?.endCursor ?? null,
    };
  } catch (err) {
    console.warn(
      `[github.projects] gh CLI items fallback failed for ${projectId}:`,
      err instanceof Error ? err.message : err,
    );
    return { items: [], hasNextPage: false, endCursor: null };
  }
}

const ProjectItemContentSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    number: z.number().optional(),
    state: z.string().optional(),
    url: z.string().optional(),
    body: z.string().optional(),
    labels: z.array(z.string()).optional(),
  })
  .nullable()
  .openapi("ProjectItemContent");

const ProjectItemFieldValueSchema = z
  .record(z.string(), z.union([z.string(), z.number()]).nullable())
  .openapi("ProjectItemFieldValues");

const ProjectItemSchema = z
  .object({
    id: z.string(),
    content: ProjectItemContentSchema,
    fieldValues: ProjectItemFieldValueSchema,
  })
  .openapi("ProjectItem");

const ProjectItemsQuery = z
  .object({
    team: z.string().min(1).openapi({ description: "Team slug or UUID" }),
    installationId: z.coerce
      .number()
      .openapi({ description: "GitHub App installation ID" }),
    projectId: z.string().min(1).openapi({ description: "GitHub Project node ID" }),
    first: z.coerce
      .number()
      .optional()
      .default(50)
      .openapi({ description: "Number of items to fetch" }),
    after: z.string().optional().openapi({ description: "Pagination cursor" }),
    status: z.string().optional().openapi({
      description: "Filter by Status field value (e.g., 'Backlog', 'In Progress')",
    }),
    noLinkedTask: z.coerce.boolean().optional().openapi({
      description: "Only return items without a linked task",
    }),
  })
  .openapi("ProjectItemsQuery");

const ProjectItemsResponse = z
  .object({
    items: z.array(ProjectItemSchema),
    pageInfo: z.object({
      hasNextPage: z.boolean(),
      endCursor: z.string().nullable(),
    }),
  })
  .openapi("ProjectItemsResponse");

export const githubProjectsItemsRouter = new OpenAPIHono();

githubProjectsItemsRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/integrations/github/projects/items",
    tags: ["Integrations"],
    summary: "List items in a GitHub Project",
    request: { query: ProjectItemsQuery },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: ProjectItemsResponse } },
      },
      401: { description: "Unauthorized" },
      400: { description: "Bad request" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) return c.text("Unauthorized", 401);

    const { team, installationId, projectId, first, after, status, noLinkedTask } =
      c.req.valid("query");

    const convex = getConvex({ accessToken });
    const connections = await convex.query(api.github.listProviderConnections, {
      teamSlugOrId: team,
    });

    const target = connections.find(
      (co) => co.isActive && co.installationId === installationId,
    );

    if (!target) {
      return c.json({
        items: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      });
    }

    const filterItems = async <
      T extends { id: string; fieldValues: Record<string, unknown> },
    >(
      items: T[],
    ): Promise<T[]> => {
      let filtered = items;

      if (status) {
        filtered = filtered.filter((item) => {
          const itemStatus = item.fieldValues?.Status;
          return typeof itemStatus === "string" && itemStatus === status;
        });
      }

      if (noLinkedTask && filtered.length > 0) {
        const itemIds = filtered.map((item) => item.id);
        const linkedTaskResults = await Promise.all(
          itemIds.map((itemId) =>
            convex.query(api.tasks.hasLinkedTask, { githubProjectItemId: itemId }),
          ),
        );
        filtered = filtered.filter((_, index) => !linkedTaskResults[index]);
      }

      return filtered;
    };

    try {
      const userOAuthToken =
        target.accountType === "User"
          ? await getGitHubUserOAuthToken(c.req.raw, {
              scopes: [...GITHUB_PROJECT_SCOPES],
            })
          : undefined;

      if (target.accountType === "User" && !userOAuthToken) {
        const fallback = await getProjectItemsViaGhCli(projectId, first, after);
        if (fallback.items.length > 0) {
          const transformedItems = fallback.items.map((item) => ({
            id: item.id,
            content: {
              id: item.id,
              title: item.title,
              url: item.url ?? undefined,
              ...(item.labels.length > 0 ? { labels: item.labels } : {}),
            },
            fieldValues: item.fieldValues,
          }));
          const filteredItems = await filterItems(transformedItems);
          return c.json({
            items: filteredItems,
            pageInfo: {
              hasNextPage: fallback.hasNextPage,
              endCursor: fallback.endCursor,
            },
          });
        }
        return c.json({
          items: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        });
      }

      const result = await getProjectItems(projectId, installationId, {
        first,
        after,
        userOAuthToken,
      });
      const filteredItems = await filterItems(result.items);
      return c.json({
        items: filteredItems,
        pageInfo: result.pageInfo,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (target.accountType === "User") {
        const fallback = await getProjectItemsViaGhCli(projectId, first, after);
        if (fallback.items.length > 0) {
          console.warn(
            `[github.projects] Primary project-items API failed for ${projectId}, served via gh CLI fallback`,
          );
          const transformedItems = fallback.items.map((item) => ({
            id: item.id,
            content: {
              id: item.id,
              title: item.title,
              url: item.url ?? undefined,
              ...(item.labels.length > 0 ? { labels: item.labels } : {}),
            },
            fieldValues: item.fieldValues,
          }));
          const filteredItems = await filterItems(transformedItems);
          return c.json({
            items: filteredItems,
            pageInfo: {
              hasNextPage: fallback.hasNextPage,
              endCursor: fallback.endCursor,
            },
          });
        }
      }
      console.error(
        `[github.projects] Failed to get items for project ${projectId}:`,
        errMsg,
      );
      return c.json({
        items: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      });
    }
  },
);
