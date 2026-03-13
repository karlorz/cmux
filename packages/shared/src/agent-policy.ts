/**
 * Agent Policy Types
 *
 * Centralized policy management for agent sandboxes.
 * Rules apply with scope hierarchy: system > team > workspace > user
 * Within same scope, lower priority numbers take precedence.
 */

/** Scope hierarchy for policy rules (most specific wins) */
export type AgentPolicyScope = "system" | "team" | "workspace" | "user";

/** Environment contexts where rules apply */
export type AgentPolicyContext = "task_sandbox" | "cloud_workspace" | "local_dev";

/** Rule categories for organization and display */
export type AgentPolicyCategory =
  | "git_policy"
  | "security"
  | "workflow"
  | "tool_restriction"
  | "custom";

/** Rule lifecycle status */
export type AgentPolicyStatus = "active" | "disabled" | "deprecated";

/** Agent types for targeting */
export type AgentPolicyAgentType = "claude" | "codex" | "gemini" | "opencode";

/**
 * Agent policy rule as stored in Convex and used at runtime.
 */
export interface AgentPolicyRule {
  /** Stable external reference ID (format: "apr_xxx") */
  ruleId: string;
  /** Human-readable name */
  name: string;
  /** Optional description */
  description?: string;

  /** Scope hierarchy: system > team > workspace > user */
  scope: AgentPolicyScope;

  /** Team ID for team/workspace/user scoped rules */
  teamId?: string;
  /** Project full name for workspace scoped rules (e.g., "owner/repo") */
  projectFullName?: string;
  /** User ID for user scoped rules */
  userId?: string;

  /** Agent types this rule applies to (empty = all agents) */
  agents?: AgentPolicyAgentType[];

  /** Environment contexts this rule applies to (empty = all contexts) */
  contexts?: AgentPolicyContext[];

  /** Rule category for organization */
  category: AgentPolicyCategory;
  /** Markdown text injected into agent instructions */
  ruleText: string;
  /** Priority within scope (lower = higher priority) */
  priority: number;

  /** Rule status */
  status: AgentPolicyStatus;

  /** Timestamps */
  createdAt: number;
  updatedAt: number;
  /** User who created the rule */
  createdBy?: string;
}

/**
 * Parameters for querying policy rules for a sandbox spawn.
 */
export interface GetPolicyRulesForSandboxParams {
  /** Team slug or ID */
  teamSlugOrId: string;
  /** Agent type (claude, codex, gemini, opencode) */
  agentType: AgentPolicyAgentType;
  /** Project full name for workspace-scoped rules */
  projectFullName?: string;
  /** User ID for user-scoped rules */
  userId?: string;
  /** Environment context */
  context: AgentPolicyContext;
}

/**
 * Scope priority ordering (lower index = broader scope).
 * Used for merging rules from different scopes.
 */
export const SCOPE_PRIORITY: AgentPolicyScope[] = [
  "system",
  "team",
  "workspace",
  "user",
];

/**
 * Check if a scope is more specific than another.
 * More specific scopes override broader scopes.
 */
export function isScopeMoreSpecific(
  scope: AgentPolicyScope,
  than: AgentPolicyScope,
): boolean {
  return SCOPE_PRIORITY.indexOf(scope) > SCOPE_PRIORITY.indexOf(than);
}

/**
 * Category display order and labels for UI.
 */
export const CATEGORY_CONFIG: Record<
  AgentPolicyCategory,
  { label: string; order: number }
> = {
  git_policy: { label: "Git Policy", order: 1 },
  security: { label: "Security", order: 2 },
  workflow: { label: "Workflow", order: 3 },
  tool_restriction: { label: "Tool Restrictions", order: 4 },
  custom: { label: "Custom", order: 5 },
};

/**
 * Generate a new rule ID in the format "apr_xxx".
 */
export function generateRuleId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 12; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `apr_${suffix}`;
}
