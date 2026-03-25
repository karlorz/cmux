/**
 * Vault REST API Routes
 *
 * Provides REST endpoints for Obsidian vault integration:
 * - GET /api/vault/recommendations - Get recommended actions from vault
 * - GET /api/vault/notes - List vault notes with filtering
 * - POST /api/vault/dispatch - Create task from recommendation
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { vaultDispatchRouter } from "./vault.dispatch.route";
import { vaultNoteRouter } from "./vault.note.route";
import { vaultNotesRouter } from "./vault.notes.route";
import { vaultRecommendationsRouter } from "./vault.recommendations.route";

// ============================================================================
// Router
// ============================================================================

export const vaultRouter = new OpenAPIHono();

vaultRouter.route("/", vaultDispatchRouter);
vaultRouter.route("/", vaultNoteRouter);
vaultRouter.route("/", vaultNotesRouter);
vaultRouter.route("/", vaultRecommendationsRouter);

