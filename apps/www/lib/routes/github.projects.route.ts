/**
 * GitHub Projects v2 API routes
 *
 * Provides endpoints for listing and managing GitHub Projects for roadmap/planning.
 *
 * IMPORTANT: GitHub Apps CANNOT access user-owned Projects v2 (platform limitation).
 * For user-owned projects, we must use the user's OAuth token with "project" scope.
 * Organization projects can use either GitHub App or OAuth token.
 *
 * @see https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects
 */

import { getAccessTokenFromRequest, getUserFromRequest } from "@/lib/utils/auth";
import { api } from "@cmux/convex/api";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { getConvex } from "../utils/get-convex";
import {
  listProjects,
  getProjectFields,
  addItemToProject,
  createDraftIssue,
  updateItemField,
  mapCmuxStatusToProjectStatus,
} from "../utils/github-projects";

export const githubProjectsRouter = new OpenAPIHono();

async function getGitHubUserOAuthToken(req: Request): Promise<string | undefined> {
  const user = await getUserFromRequest(req);
  if (!user) return undefined;

  try {
    // Stack Auth v2.8.x may not enforce scopes in this call; scope failures are
    // detected from GitHub API responses downstream.
    const githubAccount = await user.getConnectedAccount("github");
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

// Schemas

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
      .openapi({ description: "GitHub user or org login (optional, inferred from installation if omitted)" }),
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

const AddItemBody = z
  .object({
    projectId: z.string().openapi({ description: "GitHub Project node ID" }),
    contentId: z
      .string()
      .openapi({ description: "Issue or PR node ID to add" }),
  })
  .openapi("AddItemBody");

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

const UpdateFieldBody = z
  .object({
    projectId: z.string().openapi({ description: "GitHub Project node ID" }),
    itemId: z.string().openapi({ description: "Project item node ID" }),
    fieldId: z.string().openapi({ description: "Field node ID" }),
    value: z
      .record(z.string(), z.union([z.string(), z.number()]))
      .openapi({ description: "Field value (format depends on field type)" }),
  })
  .openapi("UpdateFieldBody");

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

// Routes

// GET /integrations/github/projects - List projects
githubProjectsRouter.openapi(
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

    // Verify team membership via Convex
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

    // For user-owned projects, we need the user's OAuth token with "project" scope.
    // GitHub Apps cannot access user-owned Projects v2 (platform limitation).
    let userOAuthToken: string | undefined;
    let needsReauthorization = false;

    try {
      if (ownerType === "user") {
        userOAuthToken = await getGitHubUserOAuthToken(c.req.raw);
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
      console.error(
        `[github.projects] Failed to list projects for ${owner}:`,
        errMsg,
      );
      // If user projects fail with "Resource not accessible", the OAuth token
      // is missing the 'project' scope. Stack Auth's getConnectedAccount with
      // scopes doesn't actually validate them in v2.8.x.
      if (ownerType === "user" && errMsg.includes("Resource not accessible")) {
        needsReauthorization = true;
      }
      return c.json({
        projects: [],
        needsReauthorization,
      });
    }
  },
);

// POST /integrations/github/projects/drafts/batch - Create many draft issues
githubProjectsRouter.openapi(
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

    // Verify team membership
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
        ? await getGitHubUserOAuthToken(c.req.raw)
        : undefined;

    const results: Array<{
      title: string;
      itemId: string | null;
      error?: string;
    }> = [];

    for (const item of items) {
      try {
        const itemId = await createDraftIssue(
          projectId,
          item.title,
          item.body,
          installationId,
          { userOAuthToken },
        );

        if (itemId) {
          results.push({ title: item.title, itemId });
        } else {
          results.push({
            title: item.title,
            itemId: null,
            error: "Failed to create draft issue",
          });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(
          `[github.projects] Failed to create draft issue in batch (${item.title}):`,
          errorMessage,
        );
        results.push({ title: item.title, itemId: null, error: errorMessage });
      }
    }

    return c.json({ results });
  },
);

// GET /integrations/github/projects/fields - Get project fields
githubProjectsRouter.openapi(
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

    // Verify team membership
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
          ? await getGitHubUserOAuthToken(c.req.raw)
          : undefined;
      const fields = await getProjectFields(projectId, installationId, {
        userOAuthToken,
      });
      return c.json({ fields });
    } catch (err) {
      console.error(
        `[github.projects] Failed to get fields for project ${projectId}:`,
        err instanceof Error ? err.message : err,
      );
      return c.json({ fields: [] });
    }
  },
);

// POST /integrations/github/projects/items - Add item to project
githubProjectsRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/integrations/github/projects/items",
    tags: ["Integrations"],
    summary: "Add an issue or PR to a GitHub Project",
    request: {
      query: z.object({
        team: z.string().min(1),
        installationId: z.coerce.number(),
      }),
      body: {
        content: { "application/json": { schema: AddItemBody } },
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
    const { projectId, contentId } = c.req.valid("json");

    // Verify team membership
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
          ? await getGitHubUserOAuthToken(c.req.raw)
          : undefined;
      const itemId = await addItemToProject(
        projectId,
        contentId,
        installationId,
        { userOAuthToken },
      );
      return c.json({ itemId });
    } catch (err) {
      console.error(
        `[github.projects] Failed to add item to project:`,
        err instanceof Error ? err.message : err,
      );
      return c.json({ itemId: null });
    }
  },
);

// POST /integrations/github/projects/drafts - Create draft issue
githubProjectsRouter.openapi(
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

    // Verify team membership
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
          ? await getGitHubUserOAuthToken(c.req.raw)
          : undefined;
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
      return c.json({ itemId: null });
    }
  },
);

// PATCH /integrations/github/projects/items/field - Update item field
githubProjectsRouter.openapi(
  createRoute({
    method: "patch" as const,
    path: "/integrations/github/projects/items/field",
    tags: ["Integrations"],
    summary: "Update a field value on a GitHub Project item",
    request: {
      query: z.object({
        team: z.string().min(1),
        installationId: z.coerce.number(),
      }),
      body: {
        content: { "application/json": { schema: UpdateFieldBody } },
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
    const { projectId, itemId, fieldId, value } = c.req.valid("json");

    // Verify team membership
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
      const typedValue = value as Record<string, string | number>;
      const userOAuthToken =
        target.accountType === "User"
          ? await getGitHubUserOAuthToken(c.req.raw)
          : undefined;
      const updatedItemId = await updateItemField(
        projectId,
        itemId,
        fieldId,
        typedValue,
        installationId,
        { userOAuthToken },
      );
      return c.json({ itemId: updatedItemId });
    } catch (err) {
      console.error(
        `[github.projects] Failed to update item field:`,
        err instanceof Error ? err.message : err,
      );
      return c.json({ itemId: null });
    }
  },
);

// Export status mapping for use in sync logic
export { mapCmuxStatusToProjectStatus };
