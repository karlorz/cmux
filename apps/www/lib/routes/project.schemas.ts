import { z } from "@hono/zod-openapi";

export const ProjectProgressSchema = z
  .object({
    total: z.number().openapi({ description: "Total tasks" }),
    completed: z.number().openapi({ description: "Completed tasks" }),
    running: z.number().openapi({ description: "Running tasks" }),
    failed: z.number().openapi({ description: "Failed tasks" }),
    pending: z.number().openapi({ description: "Pending tasks" }),
    cancelled: z.number().openapi({ description: "Cancelled tasks" }),
    progressPercent: z.number().openapi({ description: "Progress percentage (0-100)" }),
    lastUpdated: z.string().openapi({ description: "Last update timestamp (ISO)" }),
  })
  .openapi("ProjectProgress");

export const PlanTaskSchema = z
  .object({
    id: z.string().openapi({ description: "Task ID" }),
    prompt: z.string().openapi({ description: "Task prompt" }),
    agentName: z.string().openapi({ description: "Agent name" }),
    status: z.string().openapi({ description: "Task status" }),
    dependsOn: z.array(z.string()).optional().openapi({ description: "Task IDs this depends on" }),
    priority: z.number().optional().openapi({ description: "Task priority" }),
    orchestrationTaskId: z.string().optional().openapi({ description: "Linked orchestration task ID" }),
  })
  .openapi("PlanTask");

export const UpsertPlanRequestSchema = z
  .object({
    orchestrationId: z.string().openapi({ description: "Orchestration ID" }),
    headAgent: z.string().openapi({ description: "Head agent name" }),
    description: z.string().optional().openapi({ description: "Plan description" }),
    tasks: z.array(PlanTaskSchema).openapi({ description: "Plan tasks" }),
  })
  .openapi("UpsertPlanRequest");
