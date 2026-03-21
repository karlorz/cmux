import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

const PlanSyncBody = z.object({
  planContent: z.string().min(1).max(100000),
  planFile: z.string().optional(),
});

const PlanSyncResponse = z.object({
  success: z.boolean(),
  itemsCreated: z.number(),
  projectId: z.string().nullable(),
  error: z.string().optional(),
});

function parsePlanMarkdown(markdown: string): Array<{ title: string; body: string }> {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  if (normalized.trim().length === 0) return [];

  const lines = normalized.split("\n");
  const items: Array<{ title: string; body: string }> = [];
  let currentTitle: string | null = null;
  let currentBodyLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("## ") && !trimmed.startsWith("### ")) {
      if (currentTitle !== null) {
        items.push({
          title: currentTitle,
          body: currentBodyLines.join("\n").trim(),
        });
      }
      currentTitle = trimmed.slice(3).trim();
      currentBodyLines = [];
      continue;
    }

    if (currentTitle !== null) {
      currentBodyLines.push(line);
    }
  }

  if (currentTitle !== null) {
    items.push({
      title: currentTitle,
      body: currentBodyLines.join("\n").trim(),
    });
  }

  return items;
}

export const githubProjectsPlanSyncRouter = new OpenAPIHono();

githubProjectsPlanSyncRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/integrations/github/projects/plan-sync",
    tags: ["Integrations"],
    summary: "Sync a plan from Claude Code to GitHub Projects",
    description:
      "Called by the Claude Code plan hook when ExitPlanMode is used. " +
      "Parses the plan markdown and creates draft issues in the linked project.",
    request: {
      body: {
        content: { "application/json": { schema: PlanSyncBody } },
        required: true,
      },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: PlanSyncResponse } },
      },
      401: { description: "Unauthorized" },
    },
  }),
  async (c) => {
    const { verifyTaskRunJwt } = await import("@/lib/utils/jwt-task-run");

    const cmuxToken = c.req.header("x-cmux-token");
    if (!cmuxToken) {
      return c.json({
        success: false,
        itemsCreated: 0,
        projectId: null,
        error: "Missing x-cmux-token header",
      });
    }

    const jwtPayload = await verifyTaskRunJwt(cmuxToken);
    if (!jwtPayload) {
      return c.json({
        success: false,
        itemsCreated: 0,
        projectId: null,
        error: "Invalid or expired task run token",
      });
    }

    const { planContent, planFile: _planFile } = c.req.valid("json");
    const items = parsePlanMarkdown(planContent);
    if (items.length === 0) {
      return c.json({
        success: true,
        itemsCreated: 0,
        projectId: null,
        error: "No items found in plan",
      });
    }

    console.log(
      `[github.projects] Plan sync received from task ${jwtPayload.taskRunId}:`,
    );
    console.log(`[github.projects] Team: ${jwtPayload.teamId}`);
    console.log(`[github.projects] Items (${items.length}):`);
    for (const item of items) {
      console.log(`  - ${item.title}`);
    }

    return c.json({
      success: true,
      itemsCreated: 0,
      projectId: null,
      error: `Parsed ${items.length} items. Creation pending OAuth integration.`,
    });
  },
);
