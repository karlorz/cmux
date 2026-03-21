import { getAccessTokenFromRequest, getUserFromRequest } from "@/lib/utils/auth";
import { api } from "@cmux/convex/api";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getConvex } from "../utils/get-convex";
import { addItemToProject, updateItemField } from "../utils/github-projects";

const GITHUB_PROJECT_SCOPES = ["project"] as const;

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

const AddItemBody = z
  .object({
    projectId: z.string().openapi({ description: "GitHub Project node ID" }),
    contentId: z
      .string()
      .openapi({ description: "Issue or PR node ID to add" }),
  })
  .openapi("AddItemBody");

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

export const githubProjectsItemMutationsRouter = new OpenAPIHono();

githubProjectsItemMutationsRouter.openapi(
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
        return c.json({ itemId: null });
      }

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

githubProjectsItemMutationsRouter.openapi(
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
        return c.json({ itemId: null });
      }

      const updatedItemId = await updateItemField(
        projectId,
        itemId,
        fieldId,
        value,
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
