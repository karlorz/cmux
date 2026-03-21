import { z } from "@hono/zod-openapi";

export const ProjectStatusSchema = z
  .enum(["planning", "active", "paused", "completed", "archived"])
  .openapi("ProjectStatus");

export const ProjectGoalSchema = z
  .object({
    id: z.string().openapi({ description: "Goal ID" }),
    title: z.string().openapi({ description: "Goal title" }),
    completed: z.boolean().openapi({ description: "Whether goal is completed" }),
  })
  .openapi("ProjectGoal");

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

export const ProjectPlanSchema = z
  .object({
    orchestrationId: z.string().openapi({ description: "Orchestration ID" }),
    headAgent: z.string().openapi({ description: "Head agent name" }),
    description: z.string().optional().openapi({ description: "Plan description" }),
    tasks: z.array(PlanTaskSchema).openapi({ description: "Plan tasks" }),
    updatedAt: z.string().openapi({ description: "Last update timestamp (ISO)" }),
  })
  .openapi("ProjectPlan");

export const ProjectSchema = z
  .object({
    _id: z.string().openapi({ description: "Project ID (Convex document ID)" }),
    teamId: z.string().openapi({ description: "Team ID" }),
    userId: z.string().openapi({ description: "User ID who created the project" }),
    name: z.string().openapi({ description: "Project name" }),
    description: z.string().optional().openapi({ description: "Project description" }),
    goals: z.array(ProjectGoalSchema).optional().openapi({ description: "Project goals" }),
    status: ProjectStatusSchema,
    totalTasks: z.number().optional().openapi({ description: "Total task count" }),
    completedTasks: z.number().optional().openapi({ description: "Completed task count" }),
    failedTasks: z.number().optional().openapi({ description: "Failed task count" }),
    obsidianNotePath: z.string().optional().openapi({ description: "Path to linked Obsidian note" }),
    githubProjectId: z.string().optional().openapi({ description: "GitHub Projects v2 node ID" }),
    plan: ProjectPlanSchema.optional().openapi({ description: "Embedded orchestration plan" }),
    createdAt: z.number().openapi({ description: "Creation timestamp" }),
    updatedAt: z.number().openapi({ description: "Last update timestamp" }),
  })
  .openapi("Project");

export const CreateProjectRequestSchema = z
  .object({
    teamSlugOrId: z.string().openapi({ description: "Team slug or ID" }),
    name: z.string().min(1).max(200).openapi({ description: "Project name" }),
    description: z.string().max(2000).optional().openapi({ description: "Project description" }),
    goals: z.array(ProjectGoalSchema).optional().openapi({ description: "Initial goals" }),
    status: ProjectStatusSchema.optional().openapi({ description: "Initial status" }),
    obsidianNotePath: z.string().optional().openapi({ description: "Path to Obsidian note" }),
    githubProjectId: z.string().optional().openapi({ description: "GitHub Projects node ID" }),
  })
  .openapi("CreateProjectRequest");

export const UpdateProjectRequestSchema = z
  .object({
    name: z.string().min(1).max(200).optional().openapi({ description: "Project name" }),
    description: z.string().max(2000).optional().openapi({ description: "Project description" }),
    goals: z.array(ProjectGoalSchema).optional().openapi({ description: "Project goals" }),
    status: ProjectStatusSchema.optional().openapi({ description: "Project status" }),
    obsidianNotePath: z.string().optional().openapi({ description: "Path to Obsidian note" }),
    githubProjectId: z.string().optional().openapi({ description: "GitHub Projects node ID" }),
  })
  .openapi("UpdateProjectRequest");
