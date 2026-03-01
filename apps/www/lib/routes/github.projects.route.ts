/**
 * GitHub Projects v2 API routes
 *
 * Provides endpoints for listing and managing GitHub Projects for roadmap/planning.
 * Requires GitHub App with "Organization projects: Read and write" permission.
 */

import { getAccessTokenFromRequest } from "@/lib/utils/auth";
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

// Schemas

const ListProjectsQuery = z
  .object({
    team: z.string().min(1).openapi({ description: "Team slug or UUID" }),
    installationId: z.coerce
      .number()
      .openapi({ description: "GitHub App installation ID" }),
    owner: z.string().min(1).openapi({ description: "GitHub user or org login" }),
    ownerType: z
      .enum(["user", "organization"])
      .default("user")
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
  })
  .openapi("ProjectsResponse");

const ProjectFieldSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    dataType: z.string(),
    options: z
      .array(z.object({ id: z.string(), name: z.string() }))
      .optional(),
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
    contentId: z.string().openapi({ description: "Issue or PR node ID to add" }),
  })
  .openapi("AddItemBody");

const CreateDraftBody = z
  .object({
    projectId: z.string().openapi({ description: "GitHub Project node ID" }),
    title: z.string().min(1).openapi({ description: "Draft issue title" }),
    body: z.string().optional().openapi({ description: "Draft issue body" }),
  })
  .openapi("CreateDraftBody");

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

    const { team, installationId, owner, ownerType } = c.req.valid("query");

    // Verify team membership via Convex
    const convex = getConvex({ accessToken });
    const connections = await convex.query(api.github.listProviderConnections, {
      teamSlugOrId: team,
    });

    const target = connections.find(
      (co) => co.isActive && co.installationId === installationId
    );

    if (!target) {
      return c.json({ projects: [] });
    }

    try {
      const projects = await listProjects(owner, ownerType, installationId);
      return c.json({ projects });
    } catch (err) {
      console.error(
        `[github.projects] Failed to list projects for ${owner}:`,
        err instanceof Error ? err.message : err
      );
      return c.json({ projects: [] });
    }
  }
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
      (co) => co.isActive && co.installationId === installationId
    );

    if (!target) {
      return c.json({ fields: [] });
    }

    try {
      const fields = await getProjectFields(projectId, installationId);
      return c.json({ fields });
    } catch (err) {
      console.error(
        `[github.projects] Failed to get fields for project ${projectId}:`,
        err instanceof Error ? err.message : err
      );
      return c.json({ fields: [] });
    }
  }
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
      (co) => co.isActive && co.installationId === installationId
    );

    if (!target) {
      return c.text("Installation not found", 400);
    }

    try {
      const itemId = await addItemToProject(projectId, contentId, installationId);
      return c.json({ itemId });
    } catch (err) {
      console.error(
        `[github.projects] Failed to add item to project:`,
        err instanceof Error ? err.message : err
      );
      return c.json({ itemId: null });
    }
  }
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
      (co) => co.isActive && co.installationId === installationId
    );

    if (!target) {
      return c.text("Installation not found", 400);
    }

    try {
      const itemId = await createDraftIssue(projectId, title, body, installationId);
      return c.json({ itemId });
    } catch (err) {
      console.error(
        `[github.projects] Failed to create draft issue:`,
        err instanceof Error ? err.message : err
      );
      return c.json({ itemId: null });
    }
  }
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
      (co) => co.isActive && co.installationId === installationId
    );

    if (!target) {
      return c.text("Installation not found", 400);
    }

    try {
      const typedValue = value as Record<string, string | number>;
      const updatedItemId = await updateItemField(
        projectId,
        itemId,
        fieldId,
        typedValue,
        installationId
      );
      return c.json({ itemId: updatedItemId });
    } catch (err) {
      console.error(
        `[github.projects] Failed to update item field:`,
        err instanceof Error ? err.message : err
      );
      return c.json({ itemId: null });
    }
  }
);

// Export status mapping for use in sync logic
export { mapCmuxStatusToProjectStatus };
