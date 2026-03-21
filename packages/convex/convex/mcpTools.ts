import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * MCP Tool Registry (Q4 Phase 4)
 *
 * Manages available MCP tools for task suggestions.
 */

// Get all available tools
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("mcpTools").collect();
  },
});

// Get tools by category
export const listByCategory = query({
  args: { category: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("mcpTools")
      .withIndex("by_category", (q) =>
        q.eq(
          "category",
          args.category as
            | "documentation"
            | "memory"
            | "code"
            | "testing"
            | "deployment"
            | "general"
        )
      )
      .collect();
  },
});

// Get default-enabled tools
export const listDefaultEnabled = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("mcpTools")
      .withIndex("by_default_enabled", (q) => q.eq("defaultEnabled", true))
      .collect();
  },
});

// Get tool by name
export const getByName = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("mcpTools")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
  },
});

/**
 * Intent patterns for category boosting (Phase 4d lite).
 * Maps regex patterns to category boosts.
 */
const INTENT_PATTERNS: Array<{
  pattern: RegExp;
  categoryBoosts: Record<string, number>;
}> = [
  // Documentation/learning intent
  {
    pattern: /\b(how (do|to)|what is|explain|docs?|documentation|learn|tutorial|example)\b/i,
    categoryBoosts: { documentation: 3 },
  },
  // Testing intent
  {
    pattern: /\b(test|spec|coverage|jest|vitest|pytest|unittest|e2e|integration)\b/i,
    categoryBoosts: { testing: 3 },
  },
  // Deployment/infra intent
  {
    pattern: /\b(deploy|ci|cd|docker|kubernetes|k8s|infra|production|staging|release)\b/i,
    categoryBoosts: { deployment: 3 },
  },
  // Memory/context intent
  {
    pattern: /\b(remember|recall|history|previous|last time|context|memory)\b/i,
    categoryBoosts: { memory: 3 },
  },
  // Code/development intent (default high for dev tasks)
  {
    pattern: /\b(implement|refactor|fix|bug|feature|code|function|class|module)\b/i,
    categoryBoosts: { code: 2, documentation: 1 },
  },
  // Planning/analysis intent
  {
    pattern: /\b(plan|analyze|design|architect|think|reason|complex|strategy)\b/i,
    categoryBoosts: { general: 2 },
  },
];

/**
 * Detect intent from prompt and return category boosts.
 */
function detectIntentBoosts(prompt: string): Record<string, number> {
  const boosts: Record<string, number> = {};

  for (const { pattern, categoryBoosts } of INTENT_PATTERNS) {
    if (pattern.test(prompt)) {
      for (const [category, boost] of Object.entries(categoryBoosts)) {
        boosts[category] = (boosts[category] ?? 0) + boost;
      }
    }
  }

  return boosts;
}

// Suggest tools based on prompt keywords and intent (Phase 4d lite)
export const suggestForPrompt = query({
  args: { prompt: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 5;
    const allTools = await ctx.db.query("mcpTools").collect();

    // Tokenize prompt into lowercase words
    const promptTokens = new Set(
      args.prompt
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 2)
    );

    // Detect intent-based category boosts
    const categoryBoosts = detectIntentBoosts(args.prompt);

    // Score each tool by keyword overlap + intent boost
    const scoredTools = allTools.map((tool) => {
      const keywordMatches = tool.keywords.filter((kw) =>
        promptTokens.has(kw.toLowerCase())
      ).length;
      const descriptionMatches = tool.description
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => promptTokens.has(w)).length;

      // Base score from keyword matching
      let score = keywordMatches * 2 + descriptionMatches;

      // Apply intent-based category boost
      const intentBoost = categoryBoosts[tool.category] ?? 0;
      score += intentBoost;

      return { tool, score, intentBoost };
    });

    return scoredTools
      .filter((t) => t.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((t) => t.tool);
  },
});

// Register a new tool
export const register = mutation({
  args: {
    name: v.string(),
    displayName: v.string(),
    description: v.string(),
    keywords: v.array(v.string()),
    category: v.union(
      v.literal("documentation"),
      v.literal("memory"),
      v.literal("code"),
      v.literal("testing"),
      v.literal("deployment"),
      v.literal("general")
    ),
    defaultEnabled: v.boolean(),
    serverConfig: v.optional(
      v.object({
        command: v.optional(v.string()),
        url: v.optional(v.string()),
        env: v.optional(v.any()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("mcpTools")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    if (existing) {
      // Update existing tool
      await ctx.db.patch(existing._id, {
        ...args,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    // Create new tool
    const now = Date.now();
    return await ctx.db.insert("mcpTools", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Delete a tool
export const remove = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const tool = await ctx.db
      .query("mcpTools")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    if (tool) {
      await ctx.db.delete(tool._id);
      return true;
    }
    return false;
  },
});

// Team tool preferences
export const getTeamPreferences = query({
  args: { teamId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("teamToolPreferences")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
  },
});

export const setTeamToolPreference = mutation({
  args: {
    teamId: v.string(),
    toolName: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("teamToolPreferences")
      .withIndex("by_team_tool", (q) =>
        q.eq("teamId", args.teamId).eq("toolName", args.toolName)
      )
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("teamToolPreferences", {
      teamId: args.teamId,
      toolName: args.toolName,
      enabled: args.enabled,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Seed initial tools (run once during setup)
export const seedInitialTools = mutation({
  args: {},
  handler: async (ctx) => {
    const initialTools = [
      {
        name: "context7",
        displayName: "Context7 Docs",
        description: "Fetch up-to-date library documentation and code examples",
        keywords: [
          "docs",
          "documentation",
          "api",
          "library",
          "react",
          "typescript",
          "python",
        ],
        category: "documentation" as const,
        defaultEnabled: true,
      },
      {
        name: "devsh-memory-mcp",
        displayName: "Agent Memory",
        description: "Persistent memory for agents across sessions",
        keywords: ["memory", "remember", "recall", "context", "history"],
        category: "memory" as const,
        defaultEnabled: true,
      },
      {
        name: "github-mcp",
        displayName: "GitHub",
        description: "GitHub API access for issues, PRs, and repositories",
        keywords: [
          "github",
          "git",
          "pr",
          "issue",
          "repository",
          "commit",
          "branch",
        ],
        category: "code" as const,
        defaultEnabled: false,
      },
      {
        name: "sequential-thinking",
        displayName: "Sequential Thinking",
        description: "Step-by-step reasoning for complex problems",
        keywords: ["think", "reason", "analyze", "complex", "step", "plan"],
        category: "general" as const,
        defaultEnabled: false,
      },
    ];

    const now = Date.now();
    for (const tool of initialTools) {
      const existing = await ctx.db
        .query("mcpTools")
        .withIndex("by_name", (q) => q.eq("name", tool.name))
        .first();

      if (!existing) {
        await ctx.db.insert("mcpTools", {
          ...tool,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return { seeded: initialTools.length };
  },
});
