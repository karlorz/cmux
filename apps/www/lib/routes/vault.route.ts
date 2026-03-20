/**
 * Vault REST API Routes
 *
 * Provides REST endpoints for Obsidian vault integration:
 * - GET /api/vault/recommendations - Get recommended actions from vault
 * - GET /api/vault/notes - List vault notes with filtering
 * - POST /api/vault/dispatch - Create task from recommendation
 */

import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import {
  extractAllTags,
  filterNotesByPath,
  searchNotes,
} from "@cmux/shared/node/obsidian-reader";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getVaultConfig, readVault } from "./vault.helpers";
import { vaultDispatchRouter } from "./vault.dispatch.route";
import { vaultRecommendationsRouter } from "./vault.recommendations.route";
import { ObsidianNoteSchema } from "./vault.schemas";

// ============================================================================
// Router
// ============================================================================

export const vaultRouter = new OpenAPIHono();

vaultRouter.route("/", vaultDispatchRouter);
vaultRouter.route("/", vaultRecommendationsRouter);

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

