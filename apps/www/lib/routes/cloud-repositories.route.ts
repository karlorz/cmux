import { api } from "@cmux/convex/api";
import { type Id } from "@cmux/convex/dataModel";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getConvex } from "../utils/get-convex";
import { stackServerAppJs } from "../utils/stack";

export function registerCloudRepositoriesRoutes(app: OpenAPIHono) {
  // List cloud repositories for a team
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/teams/{teamSlugOrId}/cloud-repositories",
      request: {
        params: z.object({
          teamSlugOrId: z.string(),
        }),
      },
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.array(
                z.object({
                  _id: z.string(),
                  name: z.string(),
                  teamId: z.string(),
                  userId: z.string(),
                  provider: z.enum(["github", "gitlab", "bitbucket"]),
                  repoUrl: z.string(),
                  defaultBranch: z.string(),
                  dataVaultKey: z.string(),
                  description: z.string().optional(),
                  isPrivate: z.boolean().optional(),
                  lastSynced: z.number().optional(),
                  createdAt: z.number(),
                  updatedAt: z.number(),
                })
              ),
            },
          },
          description: "List of cloud repositories",
        },
        401: {
          description: "Unauthorized",
        },
      },
    }),
    async (c) => {
      const { teamSlugOrId } = c.req.param();
      const user = await stackServerAppJs.getUser({ tokenStore: c.req.raw });
      if (!user) {
        throw new HTTPException(401, { message: "Unauthorized" });
      }
      const { accessToken } = await user.getAuthJson();
      if (!accessToken) {
        throw new HTTPException(401, { message: "Unauthorized" });
      }

      const convex = getConvex({ accessToken });
      const repositories = await convex.query(api.cloudRepositories.list, {
        teamSlugOrId,
      });

      return c.json(repositories);
    }
  );

  // Create a cloud repository
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/teams/{teamSlugOrId}/cloud-repositories",
      request: {
        params: z.object({
          teamSlugOrId: z.string(),
        }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                name: z.string(),
                provider: z.enum(["github", "gitlab", "bitbucket"]),
                repoUrl: z.string(),
                defaultBranch: z.string().default("main"),
                dataVaultKey: z.string(),
                description: z.string().optional(),
                isPrivate: z.boolean().optional(),
              }),
            },
          },
          required: true,
        },
      },
      responses: {
        201: {
          content: {
            "application/json": {
              schema: z.object({
                repositoryId: z.string(),
              }),
            },
          },
          description: "Cloud repository created",
        },
        400: {
          description: "Bad request",
        },
        401: {
          description: "Unauthorized",
        },
      },
    }),
    async (c) => {
      const { teamSlugOrId } = c.req.param();
      const body = c.req.valid("json");
      const user = await stackServerAppJs.getUser({ tokenStore: c.req.raw });
      if (!user) {
        throw new HTTPException(401, { message: "Unauthorized" });
      }
      const { accessToken } = await user.getAuthJson();
      if (!accessToken) {
        throw new HTTPException(401, { message: "Unauthorized" });
      }

      const convex = getConvex({ accessToken });
      const result = await convex.mutation(api.cloudRepositories.create, {
        teamSlugOrId,
        ...body,
      });

      return c.json(result, 201);
    }
  );

  // Get a specific cloud repository
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/teams/{teamSlugOrId}/cloud-repositories/{id}",
      request: {
        params: z.object({
          teamSlugOrId: z.string(),
          id: z.string(),
        }),
      },
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z
                .object({
                  _id: z.string(),
                  name: z.string(),
                  teamId: z.string(),
                  userId: z.string(),
                  provider: z.enum(["github", "gitlab", "bitbucket"]),
                  repoUrl: z.string(),
                  defaultBranch: z.string(),
                  dataVaultKey: z.string(),
                  description: z.string().optional(),
                  isPrivate: z.boolean().optional(),
                  lastSynced: z.number().optional(),
                  createdAt: z.number(),
                  updatedAt: z.number(),
                })
                .nullable(),
            },
          },
          description: "Cloud repository details",
        },
        401: {
          description: "Unauthorized",
        },
        404: {
          description: "Not found",
        },
      },
    }),
    async (c) => {
      const { teamSlugOrId, id } = c.req.param();
      const user = await stackServerAppJs.getUser({ tokenStore: c.req.raw });
      if (!user) {
        throw new HTTPException(401, { message: "Unauthorized" });
      }
      const { accessToken } = await user.getAuthJson();
      if (!accessToken) {
        throw new HTTPException(401, { message: "Unauthorized" });
      }

      const convex = getConvex({ accessToken });
      const repository = await convex.query(api.cloudRepositories.get, {
        teamSlugOrId,
        id: id as Id<"cloudRepositories">,
      });

      if (!repository) {
        throw new HTTPException(404, { message: "Cloud repository not found" });
      }

      return c.json(repository);
    }
  );

  // Update a cloud repository
  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/teams/{teamSlugOrId}/cloud-repositories/{id}",
      request: {
        params: z.object({
          teamSlugOrId: z.string(),
          id: z.string(),
        }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                name: z.string().optional(),
                description: z.string().optional(),
                defaultBranch: z.string().optional(),
                isPrivate: z.boolean().optional(),
              }),
            },
          },
          required: true,
        },
      },
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.object({
                success: z.boolean(),
              }),
            },
          },
          description: "Cloud repository updated",
        },
        400: {
          description: "Bad request",
        },
        401: {
          description: "Unauthorized",
        },
        404: {
          description: "Not found",
        },
      },
    }),
    async (c) => {
      const { teamSlugOrId, id } = c.req.param();
      const body = c.req.valid("json");
      const user = await stackServerAppJs.getUser({ tokenStore: c.req.raw });
      if (!user) {
        throw new HTTPException(401, { message: "Unauthorized" });
      }
      const { accessToken } = await user.getAuthJson();
      if (!accessToken) {
        throw new HTTPException(401, { message: "Unauthorized" });
      }

      const convex = getConvex({ accessToken });
      const result = await convex.mutation(api.cloudRepositories.update, {
        teamSlugOrId,
        id: id as Id<"cloudRepositories">,
        ...body,
      });

      return c.json(result);
    }
  );

  // Delete a cloud repository
  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/teams/{teamSlugOrId}/cloud-repositories/{id}",
      request: {
        params: z.object({
          teamSlugOrId: z.string(),
          id: z.string(),
        }),
      },
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.object({
                success: z.boolean(),
              }),
            },
          },
          description: "Cloud repository deleted",
        },
        401: {
          description: "Unauthorized",
        },
        404: {
          description: "Not found",
        },
      },
    }),
    async (c) => {
      const { teamSlugOrId, id } = c.req.param();
      const user = await stackServerAppJs.getUser({ tokenStore: c.req.raw });
      if (!user) {
        throw new HTTPException(401, { message: "Unauthorized" });
      }
      const { accessToken } = await user.getAuthJson();
      if (!accessToken) {
        throw new HTTPException(401, { message: "Unauthorized" });
      }

      const convex = getConvex({ accessToken });
      const result = await convex.mutation(api.cloudRepositories.remove, {
        teamSlugOrId,
        id: id as Id<"cloudRepositories">,
      });

      return c.json(result);
    }
  );

  // Sync a cloud repository
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/teams/{teamSlugOrId}/cloud-repositories/{id}/sync",
      request: {
        params: z.object({
          teamSlugOrId: z.string(),
          id: z.string(),
        }),
      },
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.object({
                success: z.boolean(),
              }),
            },
          },
          description: "Cloud repository synced",
        },
        401: {
          description: "Unauthorized",
        },
        404: {
          description: "Not found",
        },
      },
    }),
    async (c) => {
      const { teamSlugOrId, id } = c.req.param();
      const user = await stackServerAppJs.getUser({ tokenStore: c.req.raw });
      if (!user) {
        throw new HTTPException(401, { message: "Unauthorized" });
      }
      const { accessToken } = await user.getAuthJson();
      if (!accessToken) {
        throw new HTTPException(401, { message: "Unauthorized" });
      }

      const convex = getConvex({ accessToken });
      const result = await convex.mutation(api.cloudRepositories.syncRepository, {
        teamSlugOrId,
        id: id as Id<"cloudRepositories">,
      });

      return c.json(result);
    }
  );

  // Start a cloud repository sandbox
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/sandboxes/start-repository",
      operationId: "postApiSandboxesStartRepository",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({
                teamSlugOrId: z.string(),
                ttlSeconds: z.number().optional().default(3600),
                metadata: z.any().optional(),
                taskRunId: z.string().optional(),
                taskRunJwt: z.string().optional(),
                cloudRepositoryId: z.string(),
                branch: z.string().optional(),
              }),
            },
          },
          required: true,
        },
      },
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.object({
                instanceId: z.string(),
                vscodeUrl: z.string(),
              }),
            },
          },
          description: "Sandbox started",
        },
        400: {
          description: "Bad request",
        },
        401: {
          description: "Unauthorized",
        },
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const user = await stackServerAppJs.getUser({ tokenStore: c.req.raw });
      if (!user) {
        throw new HTTPException(401, { message: "Unauthorized" });
      }
      const { accessToken } = await user.getAuthJson();
      if (!accessToken) {
        throw new HTTPException(401, { message: "Unauthorized" });
      }

      // Get repository details
      const convex = getConvex({ accessToken });
      const repository = await convex.query(api.cloudRepositories.get, {
        teamSlugOrId: body.teamSlugOrId,
        id: body.cloudRepositoryId as Id<"cloudRepositories">,
      });

      if (!repository) {
        throw new HTTPException(404, { message: "Cloud repository not found" });
      }

      // TODO: Implement actual sandbox spawning logic with Morph
      // This would involve:
      // 1. Fetching encrypted credentials from DataVault using dataVaultKey
      // 2. Spawning a Morph sandbox with the repository
      // 3. Cloning the repository into the sandbox
      // 4. Setting up the development environment

      // For now, return a placeholder response
      const instanceId = `cloud-repo-${body.cloudRepositoryId}-${Date.now()}`;
      const vscodeUrl = `https://cmux-${instanceId}.cmux.app`;

      return c.json({
        instanceId,
        vscodeUrl,
      });
    }
  );
}