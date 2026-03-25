/**
 * Vault Note API Routes
 *
 * Provides endpoints for fetching individual vault notes and tracking access:
 * - GET /api/vault/note - Fetch a single note by path (with access tracking)
 * - GET /api/vault/access/recent - List recently accessed notes
 */

import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api } from "@cmux/convex/api";
import { readNoteGitHub } from "@cmux/shared/node/obsidian-reader";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getVaultConfig } from "./vault.helpers";

// ============================================================================
// Schemas
// ============================================================================

const VaultNoteQuery = z.object({
  teamSlugOrId: z.string().openapi({ description: "Team slug or ID" }),
  path: z.string().openapi({ description: "Note path relative to vault root" }),
  accessedBy: z.string().optional().openapi({ description: "Agent or user accessing the note" }),
});

const VaultNoteAccessSchema = z.object({
  lastAccessedAt: z.number().openapi({ description: "Timestamp of last access" }),
  lastAccessedBy: z.string().nullable().openapi({ description: "Who last accessed the note" }),
  accessCount: z.number().openapi({ description: "Total number of accesses" }),
});

const VaultNoteResponseSchema = z.object({
  path: z.string().openapi({ description: "Note path" }),
  title: z.string().openapi({ description: "Note title" }),
  content: z.string().openapi({ description: "Note content (markdown body)" }),
  frontmatter: z.record(z.string(), z.unknown()).openapi({ description: "Parsed frontmatter" }),
  access: VaultNoteAccessSchema.nullable().openapi({ description: "Access tracking info" }),
});

const VaultAccessListQuery = z.object({
  teamSlugOrId: z.string().openapi({ description: "Team slug or ID" }),
  limit: z.coerce.number().optional().openapi({ description: "Maximum notes to return (default 50)" }),
});

const VaultAccessListItemSchema = z.object({
  notePath: z.string().openapi({ description: "Note path" }),
  noteTitle: z.string().nullable().openapi({ description: "Note title" }),
  lastAccessedAt: z.number().openapi({ description: "Timestamp of last access" }),
  lastAccessedBy: z.string().nullable().openapi({ description: "Who last accessed the note" }),
  accessCount: z.number().openapi({ description: "Total number of accesses" }),
});

// ============================================================================
// Router
// ============================================================================

export const vaultNoteRouter = new OpenAPIHono();

/**
 * GET /api/vault/note
 *
 * Fetches a single note by path and records the access.
 */
vaultNoteRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/vault/note",
    tags: ["Vault"],
    summary: "Get vault note by path",
    description: "Fetch a single Obsidian vault note by path. Records access for tracking.",
    request: {
      query: VaultNoteQuery,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: VaultNoteResponseSchema,
          },
        },
        description: "Note retrieved successfully",
      },
      401: { description: "Unauthorized" },
      404: { description: "Note not found" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const { teamSlugOrId, path: notePath, accessedBy } = c.req.valid("query");

    try {
      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });
      const config = await getVaultConfig(teamSlugOrId, accessToken);

      if (!config) {
        return c.text("Vault not configured", 404);
      }

      // Currently only support GitHub vaults for single note reading
      if (config.type !== "github" || !config.githubOwner || !config.githubRepo || !config.githubToken) {
        return c.text("Only GitHub vaults are supported for single note access", 400);
      }

      const note = await readNoteGitHub({
        owner: config.githubOwner,
        repo: config.githubRepo,
        path: config.githubPath || "",
        token: config.githubToken,
        branch: config.githubBranch,
        notePath,
      });

      if (!note) {
        return c.text("Note not found", 404);
      }

      // Record access (fire and forget - don't block response)
      const convex = getConvex({ accessToken });
      void convex.mutation(api.vaultNoteAccess.recordAccess, {
        teamSlugOrId,
        notePath,
        noteTitle: note.title,
        accessedBy,
      }).catch((err) => {
        console.error("[vault] Failed to record note access:", err);
      });

      // Get existing access record for response
      let access = null;
      try {
        const accessRecord = await convex.query(api.vaultNoteAccess.getByPath, {
          teamSlugOrId,
          notePath,
        });
        if (accessRecord) {
          access = {
            lastAccessedAt: accessRecord.lastAccessedAt,
            lastAccessedBy: accessRecord.lastAccessedBy ?? null,
            accessCount: accessRecord.accessCount,
          };
        }
      } catch {
        // Access record may not exist yet, that's fine
      }

      return c.json({
        path: note.path,
        title: note.title,
        content: note.content,
        frontmatter: note.frontmatter,
        access,
      });
    } catch (error) {
      console.error("[vault] Failed to fetch note:", error);
      return c.text("Failed to fetch note", 500);
    }
  },
);

/**
 * GET /api/vault/access/recent
 *
 * Lists recently accessed vault notes, sorted by last access time.
 */
vaultNoteRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/vault/access/recent",
    tags: ["Vault"],
    summary: "List recently accessed vault notes",
    description: "Get a list of vault notes sorted by last access time (most recent first).",
    request: {
      query: VaultAccessListQuery,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              notes: z.array(VaultAccessListItemSchema),
            }),
          },
        },
        description: "Access list retrieved successfully",
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

    const { teamSlugOrId, limit } = c.req.valid("query");

    try {
      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });
      const convex = getConvex({ accessToken });

      const notes = await convex.query(api.vaultNoteAccess.listRecent, {
        teamSlugOrId,
        limit,
      });

      return c.json({
        notes: notes.map((n) => ({
          notePath: n.notePath,
          noteTitle: n.noteTitle ?? null,
          lastAccessedAt: n.lastAccessedAt,
          lastAccessedBy: n.lastAccessedBy ?? null,
          accessCount: n.accessCount,
        })),
      });
    } catch (error) {
      console.error("[vault] Failed to list recent access:", error);
      return c.text("Failed to list recent access", 500);
    }
  },
);
