import { z } from "@hono/zod-openapi";

export const RecommendedActionSchema = z
  .object({
    type: z.enum(["todo", "stale_note", "missing_docs", "broken_link"]).openapi({
      description: "Type of recommended action",
    }),
    source: z.string().openapi({ description: "Source note path" }),
    description: z.string().openapi({ description: "Action description" }),
    priority: z.enum(["high", "medium", "low"]).openapi({ description: "Priority level" }),
    suggestedPrompt: z.string().optional().openapi({ description: "Suggested prompt for agent" }),
  })
  .openapi("RecommendedAction");

export const ObsidianNoteSchema = z
  .object({
    path: z.string().openapi({ description: "Note path relative to vault" }),
    title: z.string().openapi({ description: "Note title" }),
    modifiedAt: z.string().openapi({ description: "Last modified timestamp (ISO)" }),
    status: z.enum(["active", "archive", "stale"]).optional().openapi({ description: "Note status" }),
    todoCount: z.number().openapi({ description: "Number of incomplete TODOs" }),
    tags: z.array(z.string()).openapi({ description: "Note tags" }),
  })
  .openapi("ObsidianNote");

export const VaultConfigSchema = z
  .object({
    type: z.enum(["local", "github"]).openapi({ description: "Vault source type" }),
    localPath: z.string().optional().openapi({ description: "Local vault path (for local type)" }),
    githubOwner: z.string().optional().openapi({ description: "GitHub owner (for github type)" }),
    githubRepo: z.string().optional().openapi({ description: "GitHub repo (for github type)" }),
    githubPath: z.string().optional().openapi({ description: "Path within repo (for github type)" }),
    githubBranch: z.string().optional().openapi({ description: "Branch name (for github type)" }),
  })
  .openapi("VaultConfig");

export const DispatchRequestSchema = z
  .object({
    teamSlugOrId: z.string().openapi({ description: "Team slug or ID" }),
    recommendation: RecommendedActionSchema,
    agentName: z.string().optional().openapi({ description: "Agent to use (default: claude/sonnet-4.5)" }),
    repoFullName: z.string().optional().openapi({ description: "Repository full name" }),
  })
  .openapi("DispatchRequest");
