/**
 * Vault Note API Routes
 *
 * Provides endpoints for fetching individual vault notes and tracking access:
 * - GET /api/vault/note - Fetch a single note by path (with access tracking)
 * - GET /api/vault/access/recent - List recently accessed notes
 * - GET /api/vault/image - Proxy images from private GitHub repos
 */

import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api } from "@cmux/convex/api";
import {
  listGitHubNotePaths,
  readNoteGitHub,
  resolveGitHubNotePath,
} from "@cmux/shared/node/obsidian-reader";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getVaultConfig } from "./vault.helpers";

// ============================================================================
// Utilities
// ============================================================================

/**
 * Rewrite relative image URLs in markdown to use the vault image proxy.
 * This enables inline image rendering from private GitHub repos.
 *
 * Transforms: ![alt](./image.png) -> ![alt](/api/vault/image?path=./image.png&notePath=...&teamSlugOrId=...)
 * Leaves absolute URLs unchanged.
 */
function rewriteImageUrls(
  content: string,
  notePath: string,
  teamSlugOrId: string,
): string {
  // Match markdown images: ![alt](path)
  // Don't match absolute URLs (http://, https://, data:)
  return content.replace(
    /!\[([^\]]*)\]\((?!https?:\/\/|data:)([^)]+)\)/g,
    (match, alt: string, imagePath: string) => {
      // Skip if already a proxy URL
      if (imagePath.includes("/api/vault/image")) {
        return match;
      }
      const proxyUrl = `/api/vault/image?path=${encodeURIComponent(imagePath)}&notePath=${encodeURIComponent(notePath)}&teamSlugOrId=${encodeURIComponent(teamSlugOrId)}`;
      return `![${alt}](${proxyUrl})`;
    }
  );
}

async function readGitHubNoteWithResolution(options: {
  owner: string;
  repo: string;
  path: string;
  token: string;
  branch?: string;
  requestedNotePath: string;
}) {
  const {
    owner,
    repo,
    path,
    token,
    branch,
    requestedNotePath,
  } = options;

  const baseOptions = {
    owner,
    repo,
    path,
    token,
    branch,
  };

  const attemptedPaths = new Set<string>([requestedNotePath]);
  let resolvedNotePath = requestedNotePath;
  let note = await readNoteGitHub({
    ...baseOptions,
    notePath: requestedNotePath,
  });

  if (!note && !requestedNotePath.endsWith(".md")) {
    const requestedMarkdownPath = `${requestedNotePath}.md`;
    attemptedPaths.add(requestedMarkdownPath);
    note = await readNoteGitHub({
      ...baseOptions,
      notePath: requestedMarkdownPath,
    });
    if (note) {
      resolvedNotePath = requestedMarkdownPath;
    }
  }

  if (!note) {
    const notePaths = await listGitHubNotePaths(baseOptions);
    const matchedPath = resolveGitHubNotePath(requestedNotePath, notePaths);
    if (matchedPath && !attemptedPaths.has(matchedPath)) {
      note = await readNoteGitHub({
        ...baseOptions,
        notePath: matchedPath,
      });
      if (note) {
        resolvedNotePath = matchedPath;
      }
    }
  }

  return {
    note,
    resolvedNotePath,
  };
}

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

      const { note, resolvedNotePath } = await readGitHubNoteWithResolution({
        owner: config.githubOwner,
        repo: config.githubRepo,
        path: config.githubPath || "",
        token: config.githubToken,
        branch: config.githubBranch,
        requestedNotePath: notePath,
      });

      if (!note) {
        return c.text("Note not found", 404);
      }

      // Record access (fire and forget - don't block response)
      const convex = getConvex({ accessToken });
      void convex.mutation(api.vaultNoteAccess.recordAccess, {
        teamSlugOrId,
        notePath: resolvedNotePath,
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
          notePath: resolvedNotePath,
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

      // Rewrite relative image URLs to use the proxy (only for GitHub vaults)
      const processedContent =
        config.type === "github"
          ? rewriteImageUrls(note.content, resolvedNotePath, teamSlugOrId)
          : note.content;

      return c.json({
        path: note.path,
        title: note.title,
        content: processedContent,
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

// ============================================================================
// Image Proxy
// ============================================================================

const VaultImageQuery = z.object({
  teamSlugOrId: z.string().openapi({ description: "Team slug or ID" }),
  path: z.string().openapi({ description: "Image path relative to note location" }),
  notePath: z.string().openapi({ description: "Note path to resolve relative images from" }),
});

/**
 * GET /api/vault/image
 *
 * Proxy images from private GitHub vaults. Returns the image with caching headers.
 * This enables inline image rendering in the vault UI for private repos.
 */
vaultNoteRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/vault/image",
    tags: ["Vault"],
    summary: "Proxy vault image",
    description: "Fetch an image from a private GitHub vault repository. Returns the image with 10-minute cache.",
    request: {
      query: VaultImageQuery,
    },
    responses: {
      200: {
        content: {
          "image/*": {
            schema: z.any(),
          },
        },
        description: "Image retrieved successfully",
      },
      400: { description: "Invalid request or vault not configured" },
      401: { description: "Unauthorized" },
      403: { description: "GitHub App not installed on vault repository" },
      404: { description: "Image not found" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const { teamSlugOrId, path: imagePath, notePath } = c.req.valid("query");

    try {
      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });
      const config = await getVaultConfig(teamSlugOrId, accessToken);

      if (!config) {
        return c.text("Vault not configured", 400);
      }

      if (config.type !== "github" || !config.githubOwner || !config.githubRepo) {
        return c.text("Only GitHub vaults support image proxy", 400);
      }

      if (!config.githubToken) {
        return c.text(
          "GitHub App not installed on vault repository. Install the cmux GitHub App to enable image previews.",
          403
        );
      }

      // Resolve image path relative to note location
      const noteDir = notePath.includes("/")
        ? notePath.substring(0, notePath.lastIndexOf("/"))
        : "";
      const vaultBasePath = config.githubPath || "";

      // Handle relative paths (./image.png or ../images/image.png)
      let resolvedPath: string;
      if (imagePath.startsWith("./")) {
        resolvedPath = noteDir ? `${noteDir}/${imagePath.slice(2)}` : imagePath.slice(2);
      } else if (imagePath.startsWith("../")) {
        // Handle parent directory references
        const parts = noteDir.split("/").filter(Boolean);
        let imgParts = imagePath.split("/");
        while (imgParts[0] === "..") {
          parts.pop();
          imgParts = imgParts.slice(1);
        }
        resolvedPath = [...parts, ...imgParts].join("/");
      } else if (!imagePath.startsWith("/")) {
        // Relative path without ./ prefix - resolve from note directory
        resolvedPath = noteDir ? `${noteDir}/${imagePath}` : imagePath;
      } else {
        // Absolute path from vault root
        resolvedPath = imagePath.slice(1);
      }

      // Prepend vault base path if configured
      const fullPath = vaultBasePath
        ? `${vaultBasePath}/${resolvedPath}`
        : resolvedPath;

      // Fetch image from GitHub
      const contentUrl = `https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}/contents/${encodeURIComponent(fullPath)}?ref=${config.githubBranch || "main"}`;

      const response = await fetch(contentUrl, {
        headers: {
          Authorization: `Bearer ${config.githubToken}`,
          Accept: "application/vnd.github.v3.raw",
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return c.text("Image not found", 404);
        }
        console.error(`[vault/image] GitHub fetch failed: ${response.status} ${response.statusText}`);
        return c.text("Failed to fetch image from GitHub", 500);
      }

      // Get content type from response or infer from extension
      let contentType = response.headers.get("Content-Type") || "application/octet-stream";
      if (contentType === "application/octet-stream") {
        const ext = imagePath.split(".").pop()?.toLowerCase();
        const mimeTypes: Record<string, string> = {
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          gif: "image/gif",
          svg: "image/svg+xml",
          webp: "image/webp",
          ico: "image/x-icon",
        };
        contentType = mimeTypes[ext || ""] || contentType;
      }

      const imageBuffer = await response.arrayBuffer();

      return new Response(imageBuffer, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=600", // 10-minute cache
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      console.error("[vault/image] Failed to proxy image:", error);
      return c.text("Failed to proxy image", 500);
    }
  },
);
