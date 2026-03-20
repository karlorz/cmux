/**
 * PVE LXC Container Management Routes
 *
 * Provides resume and status checking endpoints for PVE LXC containers,
 * mirroring the morph.route.ts API structure for consistency.
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { pveLxcPreviewRouter } from "./pve-lxc.preview.route";
import { pveLxcResumeRouter } from "./pve-lxc.resume.route";
import { pveLxcStoppedRouter } from "./pve-lxc.stopped.route";

export const pveLxcRouter = new OpenAPIHono();

pveLxcRouter.route("/", pveLxcPreviewRouter);
pveLxcRouter.route("/", pveLxcResumeRouter);
pveLxcRouter.route("/", pveLxcStoppedRouter);
