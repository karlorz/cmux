/**
 * Vault REST API Routes
 *
 * Provides REST endpoints for Obsidian vault integration:
 * - GET /api/vault/recommendations - Get recommended actions from vault
 * - GET /api/vault/notes - List vault notes with filtering
 * - POST /api/vault/dispatch - Create task from recommendation
 */

import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api } from "@cmux/convex/api";
import {
  extractAllTags,
  filterNotesByPath,
  generateRecommendations,
  readVaultGitHub,
  readVaultLocal,
  searchNotes,
  type ObsidianNote,
} from "@cmux/shared/node/obsidian-reader";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  ObsidianNoteSchema,
  RecommendedActionSchema,
} from "./vault.schemas";
import { vaultDispatchRouter } from "./vault.dispatch.route";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get vault config from user settings or environment.
 */
export async function getVaultConfig(
  teamSlugOrId: string,
  accessToken: string
): Promise<{
  type: "local" | "github";
  localPath?: string;
  githubOwner?: string;
  githubRepo?: string;
  githubPath?: string;
  githubBranch?: string;
  githubToken?: string;
} | null> {
  // First, check environment variables for default config
  const localPath = process.env.OBSIDIAN_VAULT_PATH;
  if (localPath) {
    return { type: "local", localPath };
  }

  const githubOwner = process.env.OBSIDIAN_GITHUB_OWNER;
  const githubRepo = process.env.OBSIDIAN_GITHUB_REPO;
  const githubPath = process.env.OBSIDIAN_GITHUB_PATH;
  const githubToken = process.env.OBSIDIAN_GITHUB_TOKEN;

  if (githubOwner && githubRepo) {
    return {
      type: "github",
      githubOwner,
      githubRepo,
      githubPath: githubPath || "",
      githubBranch: process.env.OBSIDIAN_GITHUB_BRANCH || "main",
      githubToken,
    };
  }

  // Fetch user-specific vault config from workspace settings
  try {
    const convex = getConvex({ accessToken });
    const settings = await convex.query(api.workspaceSettings.get, { teamSlugOrId });

    if (settings?.vaultConfig) {
      const vc = settings.vaultConfig;
      if (vc.type === "local" && vc.localPath) {
        return { type: "local", localPath: vc.localPath };
      }
      if (vc.type === "github" && vc.githubOwner && vc.githubRepo) {
        return {
          type: "github",
          githubOwner: vc.githubOwner,
          githubRepo: vc.githubRepo,
          githubPath: vc.githubPath || "",
          githubBranch: vc.githubBranch || "main",
          // GitHub token still comes from env for security
          githubToken: process.env.OBSIDIAN_GITHUB_TOKEN,
        };
      }
    }
  } catch (error) {
    console.error("[vault] Failed to fetch workspace settings:", error);
  }

  return null;
}

/**
 * Read notes from vault based on config.
 */
export async function readVault(config: Awaited<ReturnType<typeof getVaultConfig>>): Promise<ObsidianNote[]> {
  if (!config) {
    return [];
  }

  if (config.type === "local" && config.localPath) {
    return readVaultLocal(config.localPath);
  }

  if (config.type === "github" && config.githubOwner && config.githubRepo && config.githubToken) {
    return readVaultGitHub({
      owner: config.githubOwner,
      repo: config.githubRepo,
      path: config.githubPath || "",
      token: config.githubToken,
      branch: config.githubBranch,
    });
  }

  return [];
}

// ============================================================================
// Router
// ============================================================================

export const vaultRouter = new OpenAPIHono();

vaultRouter.route("/", vaultDispatchRouter);

/**
 * GET /api/vault/recommendations
 * Get recommended actions from Obsidian vault.
 */
vaultRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/vault/recommendations",
    tags: ["Vault"],
    summary: "Get vault recommendations",
    description: "Get recommended actions extracted from Obsidian vault notes.",
    request: {
      query: z.object({
        teamSlugOrId: z.string().openapi({ description: "Team slug or ID" }),
        limit: z.coerce.number().optional().openapi({ description: "Maximum recommendations" }),
        priority: z.enum(["high", "medium", "low"]).optional().openapi({ description: "Filter by priority" }),
        type: z.enum(["todo", "stale_note", "missing_docs", "broken_link"]).optional().openapi({
          description: "Filter by type",
        }),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              recommendations: z.array(RecommendedActionSchema),
              vaultConfigured: z.boolean(),
            }),
          },
        },
        description: "Recommendations retrieved successfully",
      },
      401: { description: "Unauthorized" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const { teamSlugOrId, limit = 50, priority, type } = c.req.valid("query");

    try {
      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });

      const config = await getVaultConfig(teamSlugOrId, accessToken);
      if (!config) {
        return c.json({ recommendations: [], vaultConfigured: false });
      }

      const notes = await readVault(config);
      let recommendations = generateRecommendations(notes);

      // Apply filters
      if (priority) {
        recommendations = recommendations.filter((r) => r.priority === priority);
      }
      if (type) {
        recommendations = recommendations.filter((r) => r.type === type);
      }

      // Apply limit
      recommendations = recommendations.slice(0, limit);

      return c.json({ recommendations, vaultConfigured: true });
    } catch (error) {
      console.error("[vault] Failed to get recommendations:", error);
      return c.text("Failed to get recommendations", 500);
    }
  }
);

/**
 * GET /api/vault/notes
 * List vault notes with filtering.
 */
vaultRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/vault/notes",
    tags: ["Vault"],
    summary: "List vault notes",
    description: "List Obsidian vault notes with optional filtering.",
    request: {
      query: z.object({
        teamSlugOrId: z.string().openapi({ description: "Team slug or ID" }),
        search: z.string().optional().openapi({ description: "Search query" }),
        folder: z.string().optional().openapi({ description: "Filter by folder path" }),
        status: z.enum(["active", "archive", "stale"]).optional().openapi({ description: "Filter by status" }),
        limit: z.coerce.number().optional().openapi({ description: "Maximum notes to return" }),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              notes: z.array(ObsidianNoteSchema),
              tags: z.array(z.string()),
              vaultConfigured: z.boolean(),
            }),
          },
        },
        description: "Notes retrieved successfully",
      },
      401: { description: "Unauthorized" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const { teamSlugOrId, search, folder, status, limit = 100 } = c.req.valid("query");

    try {
      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });

      const config = await getVaultConfig(teamSlugOrId, accessToken);
      if (!config) {
        return c.json({ notes: [], tags: [], vaultConfigured: false });
      }

      let notes = await readVault(config);

      // Apply filters
      if (search) {
        notes = searchNotes(notes, search);
      }
      if (folder) {
        notes = filterNotesByPath(notes, folder);
      }
      if (status) {
        notes = notes.filter((n) => n.status === status);
      }

      // Get all tags
      const tags = extractAllTags(notes);

      // Apply limit and transform
      const limitedNotes = notes.slice(0, limit).map((note) => ({
        path: note.path,
        title: note.title,
        modifiedAt: note.modifiedAt.toISOString(),
        status: note.status,
        todoCount: note.todos.filter((t) => !t.completed).length,
        tags: (note.frontmatter.tags as string[]) || [],
      }));

      return c.json({ notes: limitedNotes, tags, vaultConfigured: true });
    } catch (error) {
      console.error("[vault] Failed to list notes:", error);
      return c.text("Failed to list notes", 500);
    }
  }
);

