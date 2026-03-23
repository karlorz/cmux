/**
 * Approval Risk Classifier
 *
 * Classifies tool/command risk levels for the approval broker.
 * Replaces hardcoded "medium" risk levels with real classification.
 *
 * Based on patterns from:
 * - IronClaw's graduated command approval (commit b58b421)
 * - cmux existing deny rules and approval broker schema
 *
 * Risk levels:
 * - low: Safe, read-only, or well-scoped operations
 * - medium: Standard write operations with reversible effects
 * - high: Destructive, irreversible, or security-sensitive operations
 */

/**
 * Risk level for approval requests.
 */
export type RiskLevel = "low" | "medium" | "high";

/**
 * Tool/command context for risk classification.
 */
export interface RiskClassificationInput {
  /** Tool name (e.g., "Bash", "Write", "Edit") */
  toolName: string;
  /** Tool input/command content */
  input: string;
  /** Optional: agent name for context */
  agentName?: string;
  /** Optional: whether this is a head agent (more permissive) */
  isHeadAgent?: boolean;
}

/**
 * Result of risk classification.
 */
export interface RiskClassificationResult {
  /** Classified risk level */
  level: RiskLevel;
  /** Reason for the classification */
  reason: string;
  /** Matched pattern if any */
  matchedPattern?: string;
}

// =============================================================================
// Pattern Definitions
// =============================================================================

/**
 * High-risk patterns - destructive, irreversible, or security-sensitive.
 * These require explicit human approval.
 */
const HIGH_RISK_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // Git destructive operations
  { pattern: /git\s+push\s+(-f|--force)/, reason: "Force push can destroy remote history" },
  { pattern: /git\s+push\s+--force-with-lease/, reason: "Force push with lease can still overwrite" },
  { pattern: /git\s+reset\s+--hard/, reason: "Hard reset discards uncommitted changes" },
  { pattern: /git\s+clean\s+-[fd]/, reason: "Clean removes untracked files permanently" },
  { pattern: /git\s+checkout\s+--\s+\./, reason: "Checkout discards all local changes" },
  { pattern: /git\s+stash\s+drop/, reason: "Stash drop permanently deletes stashed changes" },

  // File system destructive operations
  { pattern: /rm\s+(-rf?|--recursive)/, reason: "Recursive delete can remove entire directories" },
  { pattern: /rm\s+-[^r]*f/, reason: "Force delete bypasses confirmation" },
  { pattern: />\s*\/dev\/null/, reason: "Redirecting to /dev/null discards output" },
  { pattern: /truncate\s/, reason: "Truncate can destroy file contents" },
  { pattern: /dd\s+.*of=/, reason: "dd can overwrite disk data" },

  // System/security operations
  { pattern: /chmod\s+[0-7]*[0-7][0-7][0-7]/, reason: "Permission changes can affect security" },
  { pattern: /chown\s/, reason: "Ownership changes can affect security" },
  { pattern: /sudo\s/, reason: "Elevated privileges bypass normal protections" },
  { pattern: /su\s+-/, reason: "User switching can access privileged contexts" },

  // Network/external operations
  { pattern: /curl\s+.*-X\s*(POST|PUT|DELETE|PATCH)/, reason: "Mutating HTTP request to external service" },
  { pattern: /wget\s+.*--post/, reason: "POST request to external service" },

  // PR/merge operations (cmux manages these)
  { pattern: /gh\s+pr\s+(create|merge|close)/, reason: "PR lifecycle managed by cmux" },
  { pattern: /gh\s+issue\s+close/, reason: "Issue closing should be deliberate" },

  // Sandbox/infrastructure operations
  { pattern: /devsh\s+(start|delete|pause|resume)/, reason: "Sandbox lifecycle managed by cmux" },
  { pattern: /cloudrouter\s+(start|delete|stop)/, reason: "Sandbox lifecycle managed by cmux" },
  { pattern: /gh\s+workflow\s+run/, reason: "Workflow triggers affect all sandboxes" },

  // Database operations
  { pattern: /DROP\s+(TABLE|DATABASE|INDEX)/i, reason: "DROP operations are destructive" },
  { pattern: /TRUNCATE\s+TABLE/i, reason: "TRUNCATE removes all data" },
  { pattern: /DELETE\s+FROM\s+\w+\s*(;|$)/i, reason: "DELETE without WHERE affects all rows" },

  // Package/dependency operations
  { pattern: /npm\s+unpublish/, reason: "Unpublish removes packages from registry" },
  { pattern: /pip\s+uninstall/, reason: "Uninstall removes dependencies" },
];

/**
 * Low-risk patterns - read-only or well-scoped safe operations.
 */
const LOW_RISK_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // Read operations
  { pattern: /^(cat|head|tail|less|more)\s/, reason: "Read-only file viewing" },
  { pattern: /^ls\s/, reason: "Directory listing" },
  { pattern: /^pwd$/, reason: "Print working directory" },
  { pattern: /^echo\s/, reason: "Echo output" },
  { pattern: /^(grep|rg|ag)\s/, reason: "Search operation" },
  { pattern: /^find\s.*-print/, reason: "Find without modification" },
  { pattern: /^wc\s/, reason: "Word/line count" },
  { pattern: /^file\s/, reason: "File type detection" },
  { pattern: /^stat\s/, reason: "File statistics" },
  { pattern: /^du\s/, reason: "Disk usage" },
  { pattern: /^df\s/, reason: "Filesystem info" },

  // Git read operations
  { pattern: /^git\s+(status|log|diff|show|branch|tag)(\s|$)/, reason: "Git read operation" },
  { pattern: /^git\s+ls-files/, reason: "Git list files" },
  { pattern: /^git\s+rev-parse/, reason: "Git reference parsing" },

  // GitHub read operations
  { pattern: /^gh\s+(pr|issue)\s+(list|view|status)/, reason: "GitHub read operation" },
  { pattern: /^gh\s+repo\s+view/, reason: "GitHub repo view" },
  { pattern: /^gh\s+api\s+.*--method\s*GET/, reason: "GitHub API GET request" },

  // Node/package read operations
  { pattern: /^(npm|yarn|pnpm|bun)\s+(list|ls|outdated|audit)/, reason: "Package read operation" },
  { pattern: /^node\s+-e\s+['"].*console\.log/, reason: "Node evaluation for output" },

  // Safe tools
  { pattern: /^(which|whereis|type)\s/, reason: "Command location lookup" },
  { pattern: /^env$/, reason: "Environment listing" },
  { pattern: /^date$/, reason: "Date display" },
  { pattern: /^whoami$/, reason: "User identification" },
];

/**
 * Low-risk tool names that are generally safe.
 */
const LOW_RISK_TOOLS = new Set([
  "Read",
  "Glob",
  "Grep",
  "LS",
  "ListDir",
  "Search",
  "Find",
]);

/**
 * High-risk tool names that always require approval.
 */
const HIGH_RISK_TOOLS = new Set([
  "WebFetch", // External network requests
  "WebSearch", // External search
]);

// =============================================================================
// Classification Functions
// =============================================================================

/**
 * Classify the risk level of a tool/command.
 *
 * @param input - Tool name and input to classify
 * @returns Classification result with level, reason, and optional pattern
 *
 * @example
 * ```ts
 * const result = classifyRisk({
 *   toolName: "Bash",
 *   input: "git push --force origin main",
 * });
 * // { level: "high", reason: "Force push can destroy remote history", matchedPattern: "git push --force" }
 * ```
 */
export function classifyRisk(input: RiskClassificationInput): RiskClassificationResult {
  const { toolName, input: commandInput, isHeadAgent } = input;

  // Head agents get more permissive treatment for sandbox management
  if (isHeadAgent) {
    // Still flag truly destructive operations
    const headAgentHighRisk = HIGH_RISK_PATTERNS.filter(p =>
      !p.reason.includes("managed by cmux") // Allow cmux-managed operations for head agents
    );

    for (const { pattern, reason } of headAgentHighRisk) {
      if (pattern.test(commandInput)) {
        return {
          level: "high",
          reason,
          matchedPattern: pattern.source,
        };
      }
    }

    // Head agents default to medium for most operations
    return {
      level: "medium",
      reason: "Head agent operation (elevated trust)",
    };
  }

  // Check tool-level classification first
  if (LOW_RISK_TOOLS.has(toolName)) {
    return {
      level: "low",
      reason: `${toolName} is a read-only tool`,
    };
  }

  if (HIGH_RISK_TOOLS.has(toolName)) {
    return {
      level: "high",
      reason: `${toolName} involves external network access`,
    };
  }

  // For Bash and similar, check command patterns
  if (toolName === "Bash" || toolName === "Shell" || toolName === "Execute") {
    // Check high-risk patterns first
    for (const { pattern, reason } of HIGH_RISK_PATTERNS) {
      if (pattern.test(commandInput)) {
        return {
          level: "high",
          reason,
          matchedPattern: pattern.source,
        };
      }
    }

    // Check low-risk patterns
    for (const { pattern, reason } of LOW_RISK_PATTERNS) {
      if (pattern.test(commandInput)) {
        return {
          level: "low",
          reason,
          matchedPattern: pattern.source,
        };
      }
    }
  }

  // Write/Edit tools are medium by default
  if (toolName === "Write" || toolName === "Edit" || toolName === "NotebookEdit") {
    return {
      level: "medium",
      reason: "File modification operation",
    };
  }

  // Default to medium for unknown patterns
  return {
    level: "medium",
    reason: "Standard operation (no specific risk pattern matched)",
  };
}

/**
 * Convenience function to get just the risk level string.
 *
 * @param input - Tool name and input to classify
 * @returns Risk level string
 */
export function getRiskLevel(input: RiskClassificationInput): RiskLevel {
  return classifyRisk(input).level;
}

/**
 * Check if an operation should be auto-approved (low risk).
 *
 * @param input - Tool name and input to classify
 * @returns True if the operation is low-risk and can be auto-approved
 */
export function isAutoApprovable(input: RiskClassificationInput): boolean {
  return classifyRisk(input).level === "low";
}

/**
 * Check if an operation requires explicit human approval (high risk).
 *
 * @param input - Tool name and input to classify
 * @returns True if the operation is high-risk and requires human approval
 */
export function requiresExplicitApproval(input: RiskClassificationInput): boolean {
  return classifyRisk(input).level === "high";
}
