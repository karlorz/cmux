/**
 * Agent Memory Protocol - Spike S2b
 *
 * Three-tier memory architecture:
 * - Layer 1 (daily/): Ephemeral daily logs - auto-dated, session-specific
 * - Layer 2 (knowledge/): Curated long-term memory with P0/P1/P2 priority tiers
 *   - P0 Core: Never expires - project fundamentals, safety rules, invariants
 *   - P1 Active: 90-day TTL - ongoing work, current strategies, recent decisions
 *   - P2 Reference: 30-day TTL - debug notes, one-time findings, temporary context
 * - Layer 3 (behavior/): Self-improving behavior memory
 *   - HOT.md: Active preferences and workflow rules (high-frequency)
 *   - corrections.jsonl: Correction log for learning from mistakes
 *   - domains/: Domain-specific rules (e.g., testing, debugging, security)
 *   - projects/: Project-scoped preferences
 *   - archive/: Demoted/inactive rules
 *
 * Seeds memory directory with:
 * - TASKS.json, MAILBOX.json at root
 * - knowledge/MEMORY.md for permanent insights (P0/P1/P2 sections)
 * - daily/{date}.md for session-specific notes
 * - behavior/HOT.md, behavior/corrections.jsonl, behavior/index.json for behavior memory
 *
 * IMPORTANT: Memory is stored at /root/lifecycle/memory/ (OUTSIDE the git workspace)
 * to avoid polluting the user's repository with untracked files. This follows the
 * pattern used by Claude hooks, Codex, and OpenCode which all use /root/lifecycle/.
 */

import type { AuthFile } from "./worker-schemas";

// Memory protocol directory path (absolute, outside git workspace)
// Using /root/lifecycle/ to match existing patterns (Claude hooks, Codex, OpenCode)
// This prevents git pollution - memory files won't appear in `git status`
export const MEMORY_PROTOCOL_DIR = "/root/lifecycle/memory";

// Subdirectories for two-tier memory architecture
export const MEMORY_DAILY_DIR = `${MEMORY_PROTOCOL_DIR}/daily`;
export const MEMORY_KNOWLEDGE_DIR = `${MEMORY_PROTOCOL_DIR}/knowledge`;

// Orchestration subdirectory for multi-agent coordination
export const MEMORY_ORCHESTRATION_DIR = `${MEMORY_PROTOCOL_DIR}/orchestration`;

// Behavior memory subdirectory for self-improving preferences
export const MEMORY_BEHAVIOR_DIR = `${MEMORY_PROTOCOL_DIR}/behavior`;
export const MEMORY_BEHAVIOR_DOMAINS_DIR = `${MEMORY_BEHAVIOR_DIR}/domains`;
export const MEMORY_BEHAVIOR_PROJECTS_DIR = `${MEMORY_BEHAVIOR_DIR}/projects`;
export const MEMORY_BEHAVIOR_ARCHIVE_DIR = `${MEMORY_BEHAVIOR_DIR}/archive`;

/**
 * Get today's date string in YYYY-MM-DD format for daily log files.
 */
export function getTodayDateString(): string {
  const iso = new Date().toISOString();
  return iso.slice(0, iso.indexOf("T"));
}

/**
 * Seed content for TASKS.json
 */
export function getTasksSeedContent(sandboxId: string): string {
  const seed = {
    version: 1,
    tasks: [],
    metadata: {
      sandboxId,
      createdAt: new Date().toISOString(),
    },
  };
  return JSON.stringify(seed, null, 2);
}

/**
 * Seed content for knowledge/MEMORY.md (Layer 2 - permanent insights with priority tiers)
 */
export function getKnowledgeSeedContent(): string {
  return `# Project Knowledge

> Curated insights organized by priority. Add date tags for TTL tracking.

## P0 - Core (Never Expires)
<!-- Fundamental project facts, configuration, invariants -->
<!-- Examples: "Uses bun, not npm", "Port 3001 for auth service" -->

## P1 - Active (90-day TTL)
<!-- Ongoing work context, current strategies, recent decisions -->
<!-- Review entries older than 90 days: promote to P0 or remove -->

## P2 - Reference (30-day TTL)
<!-- Temporary findings, debug notes, one-off context -->
<!-- Review entries older than 30 days: promote to P1 or remove -->

---
*Priority guide: P0 = permanent truth, P1 = active context, P2 = temporary reference*
*Format: - [YYYY-MM-DD] Your insight here*
`;
}

/**
 * Seed content for daily/{date}.md (Layer 1 - ephemeral logs)
 * @param date - Date string in YYYY-MM-DD format
 */
export function getDailyLogSeedContent(date: string): string {
  return `# Daily Log: ${date}

> Session-specific observations. Temporary notes go here.

---
`;
}

/**
 * Seed content for MAILBOX.json
 */
export function getMailboxSeedContent(): string {
  const seed = {
    version: 1,
    messages: [],
  };
  return JSON.stringify(seed, null, 2);
}

// =============================================================================
// Behavior Memory (Layer 3) - Self-improving preferences and workflow rules
// =============================================================================

/**
 * Behavior rule structure for HOT.md entries (parsed from markdown)
 */
export interface BehaviorRule {
  id: string;
  rule: string;
  scope?: "global" | "domain" | "project";
  domain?: string;
  project?: string;
  confirmed?: boolean;
  lastUsedAt?: string;
  timesUsed?: number;
  createdAt: string;
}

/**
 * Correction entry structure for corrections.jsonl
 */
export interface BehaviorCorrection {
  id: string;
  timestamp: string;
  wrongAction: string;
  correctAction: string;
  context?: string;
  learnedRule?: string;
  rulePromotedTo?: "HOT" | "domain" | "project";
}

/**
 * Behavior index structure for index.json
 */
export interface BehaviorIndex {
  version: number;
  lastUpdated: string;
  stats: {
    hotRules: number;
    corrections: number;
    domains: string[];
    projects: string[];
    archivedRules: number;
  };
}

/**
 * Seed content for behavior/HOT.md (high-frequency behavior rules)
 */
export function getBehaviorHotSeedContent(): string {
  return `# HOT Behavior Rules

> Active preferences and workflow rules. These are high-frequency rules that apply across all work.

## Format

Each rule should be on its own line with optional metadata:
- \`[confirmed]\` - User explicitly confirmed this rule
- \`[domain:X]\` - Applies to specific domain (testing, debugging, etc.)
- \`[project:X]\` - Applies to specific project

## Rules

<!-- Add rules below this line -->

---
*Add rules learned from corrections and user feedback here.*
*Rules that aren't used frequently should be demoted to domain/ or archive/.*
`;
}

/**
 * Seed content for behavior/corrections.jsonl (empty - append-only log)
 */
export function getBehaviorCorrectionsSeedContent(): string {
  // Empty file - corrections are appended as JSONL
  return "";
}

/**
 * Seed content for behavior/index.json (behavior metadata)
 */
export function getBehaviorIndexSeedContent(): string {
  const index: BehaviorIndex = {
    version: 1,
    lastUpdated: new Date().toISOString(),
    stats: {
      hotRules: 0,
      corrections: 0,
      domains: [],
      projects: [],
      archivedRules: 0,
    },
  };
  return JSON.stringify(index, null, 2);
}

// Orchestration learning file paths
export const MEMORY_BEHAVIOR_LEARNINGS_PATH = `${MEMORY_BEHAVIOR_DIR}/LEARNINGS.jsonl`;
export const MEMORY_BEHAVIOR_ERRORS_PATH = `${MEMORY_BEHAVIOR_DIR}/ERRORS.jsonl`;
export const MEMORY_BEHAVIOR_FEATURE_REQUESTS_PATH = `${MEMORY_BEHAVIOR_DIR}/FEATURE_REQUESTS.jsonl`;
export const MEMORY_BEHAVIOR_SKILL_CANDIDATES_PATH = `${MEMORY_BEHAVIOR_DIR}/skill-candidates.json`;

/**
 * Seed content for behavior/LEARNINGS.jsonl (orchestration learnings log)
 */
export function getBehaviorLearningsSeedContent(): string {
  // Empty file - learnings are appended as JSONL
  return "";
}

/**
 * Seed content for behavior/ERRORS.jsonl (orchestration errors log)
 */
export function getBehaviorErrorsSeedContent(): string {
  // Empty file - errors are appended as JSONL
  return "";
}

/**
 * Seed content for behavior/FEATURE_REQUESTS.jsonl (feature requests log)
 */
export function getBehaviorFeatureRequestsSeedContent(): string {
  // Empty file - feature requests are appended as JSONL
  return "";
}

/**
 * Seed content for behavior/skill-candidates.json
 */
export function getBehaviorSkillCandidatesSeedContent(): string {
  return JSON.stringify({
    version: 1,
    candidates: [],
    lastUpdated: new Date().toISOString(),
  }, null, 2);
}

/**
 * Generate unique behavior rule ID
 */
export function generateBehaviorRuleId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `rule_${timestamp}${random}`;
}

/**
 * Generate unique correction ID
 */
export function generateCorrectionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `corr_${timestamp}${random}`;
}

/**
 * Format a correction entry for appending to corrections.jsonl
 */
export function formatBehaviorCorrection(
  correction: BehaviorCorrection
): string {
  return JSON.stringify(correction);
}

/**
 * Orchestration task status for PLAN.json
 */
export type OrchestrationTaskStatus =
  | "pending"
  | "assigned"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Orchestration task in PLAN.json
 */
export interface OrchestrationTask {
  id: string;
  prompt: string;
  agentName: string;
  status: OrchestrationTaskStatus;
  taskRunId?: string;
  dependsOn?: string[];
  priority?: number;
  result?: string;
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

/**
 * Orchestration plan structure for PLAN.json
 */
export interface OrchestrationPlan {
  version: number;
  createdAt: string;
  updatedAt: string;
  status: "pending" | "running" | "completed" | "failed" | "paused";
  headAgent: string;
  orchestrationId: string;
  description?: string;
  tasks: OrchestrationTask[];
  metadata?: Record<string, unknown>;
}

/**
 * Spawned agent record in AGENTS.json
 */
export interface SpawnedAgent {
  taskRunId: string;
  agentName: string;
  status: OrchestrationTaskStatus;
  sandboxId?: string;
  prompt: string;
  spawnedAt: string;
  completedAt?: string;
  result?: string;
  errorMessage?: string;
}

/**
 * Agents registry structure for AGENTS.json
 */
export interface AgentsRegistry {
  version: number;
  orchestrationId: string;
  headAgent: string;
  agents: SpawnedAgent[];
}

/**
 * Orchestration event types for EVENTS.jsonl
 */
export type OrchestrationEventType =
  | "orchestration_started"
  | "orchestration_completed"
  | "orchestration_failed"
  | "orchestration_paused"
  | "orchestration_resumed"
  | "agent_spawned"
  | "agent_started"
  | "agent_completed"
  | "agent_failed"
  | "agent_cancelled"
  | "message_sent"
  | "message_received"
  | "dependency_resolved"
  | "plan_updated";

/**
 * Orchestration event for EVENTS.jsonl
 */
export interface OrchestrationEvent {
  timestamp: string;
  event: OrchestrationEventType;
  taskRunId?: string;
  agentName?: string;
  status?: string;
  message?: string;
  from?: string;
  to?: string;
  type?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Generate unique orchestration ID
 */
export function generateOrchestrationId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `orch_${timestamp}${random}`;
}

/**
 * Generate unique task ID for orchestration tasks
 */
export function generateOrchestrationTaskId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `task_${timestamp}${random}`;
}

/**
 * Seed content for PLAN.json (orchestration plan)
 */
export function getOrchestrationPlanSeedContent(
  headAgent: string,
  orchestrationId: string,
  description?: string
): string {
  const plan: OrchestrationPlan = {
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "pending",
    headAgent,
    orchestrationId,
    description,
    tasks: [],
  };
  return JSON.stringify(plan, null, 2);
}

/**
 * Seed content for AGENTS.json (spawned agents registry)
 */
export function getAgentsRegistrySeedContent(
  headAgent: string,
  orchestrationId: string
): string {
  const registry: AgentsRegistry = {
    version: 1,
    orchestrationId,
    headAgent,
    agents: [],
  };
  return JSON.stringify(registry, null, 2);
}

/**
 * Format an orchestration event for EVENTS.jsonl
 */
export function formatOrchestrationEvent(
  event: OrchestrationEvent
): string {
  return JSON.stringify(event);
}

/**
 * Memory protocol instructions for agents.
 * This text should be included in each agent's instruction file.
 *
 * @param agentNameEnvVar - The environment variable name for agent name (default: $CMUX_AGENT_NAME)
 */
export function getMemoryProtocolInstructions(
  agentNameEnvVar: string = "$CMUX_AGENT_NAME"
): string {
  return `## cmux Agent Memory Protocol

You have access to persistent memory at \`${MEMORY_PROTOCOL_DIR}/\`:

> Note: Memory is stored outside the git workspace to avoid polluting your repository.

### Memory Structure

- \`${MEMORY_KNOWLEDGE_DIR}/MEMORY.md\` - Long-term insights (curated)
- \`${MEMORY_DAILY_DIR}/{date}.md\` - Daily logs (ephemeral)
- \`${MEMORY_PROTOCOL_DIR}/TASKS.json\` - Task registry
- \`${MEMORY_PROTOCOL_DIR}/MAILBOX.json\` - Inter-agent messages
- \`${MEMORY_BEHAVIOR_DIR}/HOT.md\` - Active behavior rules (self-improving)
- \`${MEMORY_BEHAVIOR_DIR}/corrections.jsonl\` - Correction log

### On Start
1. Read \`knowledge/MEMORY.md\` for permanent project insights
2. Read \`behavior/HOT.md\` for active workflow preferences
3. Read \`TASKS.json\` to see existing tasks and their statuses
4. Optionally scan recent \`daily/\` logs for recent context

### During Work
- Append observations to \`daily/{today}.md\` (create if doesn't exist)
- Update task statuses in TASKS.json

### On Completion
- **Daily log**: Append what you did today to \`daily/{today}.md\`
- **Knowledge**: Promote KEY learnings to \`knowledge/MEMORY.md\` (only permanent insights)
- **Behavior**: If the user corrected you, add the correction to \`behavior/corrections.jsonl\` and consider adding a rule to \`behavior/HOT.md\`
- Update TASKS.json with final statuses

### Execution Summary (Required on Completion)

Before finishing, write an execution summary to \`daily/{today}.md\` under an \`## Execution Summary\` heading. This is the primary review artifact — it lets developers understand your work at a glance without reading code diffs.

**Format (all 4 sections required):**

1. **What was done** — 3-5 bullet points describing changes
2. **Changes flowchart** — Mermaid \`flowchart TD\` diagram showing what changed and how components connect
3. **Files changed** — Grouped by area (backend, frontend, CLI, etc.)
4. **Test results** — Pass/fail with details

**Mermaid diagram guidelines:**
- Use \`flowchart TD\` (top-down)
- 5-15 nodes maximum
- Group related nodes in subgraphs by area
- Use fill colors for new/modified components: \`style NodeId fill:#d4edda\` (new), \`style NodeId fill:#fff3cd\` (modified)
- Show data flow with labeled arrows

**Example:**

\`\`\`markdown
## Execution Summary

### What was done
- Added JWT authentication middleware for agent endpoints
- Created task creation endpoint at /api/v1/agent/task/create
- Wired sandbox spawn to use existing provider infrastructure
- Added integration test for agent auth flow

### Changes Flowchart
\\\`\\\`\\\`mermaid
flowchart TD
    subgraph "Agent in Sandbox"
        A[devsh CLI] -->|JWT auth| B[POST /api/v1/agent/task/create]
    end
    subgraph "apps/server"
        B --> C[JWT Middleware]
        C --> D[Task Handler]
        D --> E[Convex Mutation]
    end
    subgraph "Convex Backend"
        E --> F[tasks.createInternal]
        F --> G[agentSpawner]
    end
    style B fill:#d4edda
    style C fill:#d4edda
    style D fill:#d4edda
\\\`\\\`\\\`

### Files changed
**Backend (apps/server)**
- \\\`lib/routes/agent.route.ts\\\` — NEW: JWT-auth agent endpoints
- \\\`lib/middleware/jwt-auth.ts\\\` — NEW: JWT verification middleware

**Shared (packages/shared)**
- \\\`src/agent-auth.ts\\\` — MODIFIED: Added token validation helper

### Test results
- \\\`bun check\\\`: PASS
- \\\`vitest agent.route.test.ts\\\`: PASS (3/3)
\`\`\`

### What Goes Where?

**Knowledge vs Behavior**: Knowledge is about *facts* (what IS). Behavior is about *preferences* (how to ACT).

| Type | Location | Example |
|------|----------|---------|
| Project facts | \`knowledge/MEMORY.md\` | "This project uses bun, not npm" |
| Architecture decisions | \`knowledge/MEMORY.md\` | "Auth uses JWT with 24h expiry" |
| Workflow preferences | \`behavior/HOT.md\` | "Always run tests before committing" |
| Tool preferences | \`behavior/HOT.md\` | "Use vitest, not jest" |
| User corrections | \`behavior/corrections.jsonl\` | {"wrong": "Used npm", "correct": "Use bun"} |
| Domain-specific rules | \`behavior/domains/testing.md\` | "Mock external APIs in unit tests" |
| Today's work | \`daily/{date}.md\` | "Fixed bug in auth.ts line 42" |

**Knowledge (facts about the project)**:
- P0 Core: Tooling, ports, invariants ("Uses bun", "Port 3001 for auth")
- P1 Active: Current work context ("Auth refactor in progress")
- P2 Reference: Temporary findings ("Sandbox morphvm_abc for testing")

**Behavior (how you should act)**:
- HOT rules: High-frequency preferences that apply everywhere
- Domain rules: Context-specific preferences (testing, debugging, security)
- Project rules: Rules for specific repositories
- Corrections: Log of mistakes and fixes (append-only)

### Priority Guidelines

- **Date-tag format**: \`- [YYYY-MM-DD] Your insight here\`
- **P0 Core**: Rare, highly stable truths. Never expires. Examples: tooling choices, critical ports, invariants.
- **P1 Active**: Current focus areas. Review after 90 days - promote to P0 if still relevant, or remove.
- **P2 Reference**: One-off findings. Review after 30 days - promote to P1 if still useful, or remove.
- **Daily logs**: Raw session notes. Do not promote everything - only curate what's worth keeping.

### Inter-Agent Messaging (S10 Coordination)

Your agent name: **${agentNameEnvVar}**

You can coordinate with other agents on the same task using the mailbox MCP tools:

| Tool | Description |
|------|-------------|
| \`send_message(to, message, type)\` | Send a message to another agent (or "*" for broadcast) |
| \`get_my_messages()\` | Get messages addressed to you |
| \`mark_read(messageId)\` | Mark a message as read |

#### Message Types
- **handoff**: Transfer work to another agent ("I've completed X, please continue with Y")
- **request**: Ask another agent to do something specific ("Can you review this file?")
- **status**: Broadcast progress updates to all agents ("Starting work on auth module")

#### Coordination Patterns

1. **Handoff Pattern**: When you complete a piece of work that another agent should continue:
   \`\`\`
   send_message("codex/gpt-5.1-codex", "I've implemented the API endpoints. Please write tests for them.", "handoff")
   \`\`\`

2. **Request Pattern**: When you need help from a specific agent:
   \`\`\`
   send_message("claude/opus-4.5", "Can you review the auth flow in src/auth.ts?", "request")
   \`\`\`

3. **Status Broadcast**: Keep all agents informed of progress:
   \`\`\`
   send_message("*", "Completed database migrations, moving to API layer", "status")
   \`\`\`

#### On Start
Check for messages from previous agents:
\`\`\`
get_my_messages()  // See if any agent has left instructions for you
\`\`\`

Messages from previous runs are automatically seeded into your mailbox.

### Behavior Memory (Self-Improving)

Behavior memory helps you learn from corrections and user feedback. Unlike knowledge (facts), behavior memory captures *preferences* about how to work.

#### Structure

- \`behavior/HOT.md\` - Active rules that apply to all work
- \`behavior/corrections.jsonl\` - Log of corrections (append-only)
- \`behavior/domains/\` - Domain-specific rules (e.g., \`testing.md\`, \`security.md\`)
- \`behavior/projects/\` - Project-specific rules
- \`behavior/archive/\` - Demoted/inactive rules

#### When to Update Behavior

1. **User explicitly corrects you**: Add to \`corrections.jsonl\` and consider promoting to \`HOT.md\`
2. **User states a preference**: Add to \`HOT.md\` with \`[confirmed]\` tag
3. **Pattern emerges**: After 2-3 similar corrections, create a rule in \`HOT.md\`

#### HOT.md Format

Rules in \`behavior/HOT.md\` use simple markdown with optional tags:
\`\`\`markdown
## Rules
- [confirmed] Always use bun instead of npm
- [domain:testing] Run tests before committing
- [project:cmux] Use vitest for unit tests
\`\`\`

#### corrections.jsonl Format

Each line is a JSON object:
\`\`\`json
{"id":"corr_abc123","timestamp":"2026-03-12T10:00:00Z","wrongAction":"Used npm install","correctAction":"Should use bun install","learnedRule":"Always use bun"}
\`\`\`

#### Best Practices

- Keep HOT.md concise (under 50 rules)
- Archive rules that haven't been used in 30+ days
- Don't mix facts (knowledge) with preferences (behavior)
- When in doubt, log to corrections.jsonl first before creating a rule
`;
}

/**
 * Get head agent orchestration instructions for agents that coordinate sub-agents.
 * This text should be included when spawning a cloud workspace as an orchestration head.
 *
 * Head agents receive CMUX_IS_ORCHESTRATION_HEAD=1 in their environment and have
 * special responsibilities for coordinating work across multiple sub-agents.
 */
export function getHeadAgentInstructions(): string {
  return `## Head Agent Orchestration

You are operating as an **orchestration head agent** - a coordinator that spawns and manages sub-agents to accomplish complex tasks.

### Your Role

1. **Plan the Work**: Break down the overall task into discrete sub-tasks
2. **Spawn Sub-Agents**: Use \`devsh orchestrate spawn\` to create sub-agents for each task
3. **Monitor Progress**: Use \`devsh orchestrate status\` with \`--watch\` to track completion
4. **Collect Results**: Use \`devsh orchestrate results\` to aggregate outputs
5. **Coordinate**: Handle dependencies and sequencing between tasks

### Key Commands

| Command | Description |
|---------|-------------|
| \`devsh orchestrate spawn --agent <name> <prompt>\` | Spawn a sub-agent |
| \`devsh orchestrate status <id> --watch\` | Monitor task progress in real-time |
| \`devsh orchestrate results <orch-id>\` | Get aggregated results from all sub-agents |
| \`devsh orchestrate list\` | List all orchestration tasks |
| \`devsh orchestrate message send <to> <msg>\` | Send message to sub-agent |

### Orchestration Files

Your orchestration state is stored in \`${MEMORY_ORCHESTRATION_DIR}/\`:

- **PLAN.json**: Your execution plan with task statuses
- **AGENTS.json**: Registry of spawned sub-agents
- **EVENTS.jsonl**: Event stream of orchestration activity

### Bi-directional Sync

Use the \`pull_orchestration_updates\` MCP tool to sync remote state:
\`\`\`
pull_orchestration_updates()  // Fetch latest task statuses from server
\`\`\`

This updates your local PLAN.json with:
- Current status of all sub-agent tasks
- Unread messages from the mailbox
- Aggregated completion counts

### Coordination Patterns

**Sequential Pipeline** (task A -> task B -> task C):
\`\`\`bash
# Spawn with dependencies
devsh orchestrate spawn --agent claude/opus-4.6 "Task A"  # Returns orch_id_a
devsh orchestrate spawn --agent claude/opus-4.6 --depends-on orch_id_a "Task B"
\`\`\`

**Parallel Fan-out** (spawn N agents, wait for all):
\`\`\`bash
# Spawn multiple agents in parallel
devsh orchestrate spawn --agent claude/opus-4.6 "Task 1"
devsh orchestrate spawn --agent codex/gpt-5.2-xhigh "Task 2"
devsh orchestrate spawn --agent claude/opus-4.6 "Task 3"
# Then monitor with --watch
\`\`\`

**Leader-Worker** (you create plan, workers execute):
1. Create a detailed plan
2. Spawn sub-agents with specific task prompts
3. Monitor completion and handle any failures
4. Aggregate results and produce final output

### Best Practices

- **Be Specific**: Give sub-agents clear, focused prompts
- **Use Dependencies**: Chain related tasks with \`--depends-on\`
- **Monitor Actively**: Use \`--watch\` to catch failures early
- **Handle Errors**: Check for failed tasks and retry or adjust
- **Document Progress**: Log orchestration decisions in daily log
`;
}

/**
 * Get the startup command to create the memory directory structure.
 * Creates daily/, knowledge/, orchestration/, and behavior/ subdirectories.
 */
export function getMemoryStartupCommand(): string {
  return `mkdir -p ${MEMORY_DAILY_DIR} ${MEMORY_KNOWLEDGE_DIR} ${MEMORY_ORCHESTRATION_DIR} ${MEMORY_BEHAVIOR_DIR} ${MEMORY_BEHAVIOR_DOMAINS_DIR} ${MEMORY_BEHAVIOR_PROJECTS_DIR} ${MEMORY_BEHAVIOR_ARCHIVE_DIR}`;
}

/**
 * Get startup commands to create cross-tool instruction symlinks.
 *
 * Master file: ~/.claude/CLAUDE.md (created by Claude environment)
 * Symlinks:
 *   - ~/.codex/AGENTS.md -> ~/.claude/CLAUDE.md (for Codex CLI)
 *   - ~/.gemini/GEMINI.md -> ~/.claude/CLAUDE.md (for Gemini CLI)
 *
 * This enables all tools to share the same instructions without polluting
 * the git repository. Each tool reads from its native user-level path.
 */
export function getCrossToolSymlinkCommands(): string[] {
  return [
    "mkdir -p ~/.codex ~/.gemini",
    "[ -f ~/.claude/CLAUDE.md ] && ln -sf ~/.claude/CLAUDE.md ~/.codex/AGENTS.md || true",
    "[ -f ~/.claude/CLAUDE.md ] && ln -sf ~/.claude/CLAUDE.md ~/.gemini/GEMINI.md || true",
  ];
}

/**
 * Generate the memory sync bash script that reads memory files and POSTs them to Convex.
 * This script is called by provider stop hooks before crown/complete.
 *
 * Features:
 * - Best-effort sync (|| true for all commands)
 * - Client-side truncation with head -c 500000
 * - Uses jq for safe JSON construction
 * - Logs to /root/lifecycle/memory-sync.log
 */
export function getMemorySyncScript(): string {
  return `#!/bin/bash
# Memory sync script - syncs agent memory files to Convex
# Called by stop hooks before crown/complete

set -euo pipefail

LOG_FILE="/root/lifecycle/memory-sync.log"
MEMORY_DIR="${MEMORY_PROTOCOL_DIR}"
MAX_SIZE=500000

log() {
  echo "[$(date -Iseconds)] $*" >> "$LOG_FILE"
}

# Best-effort wrapper - never fail the stop hook
sync_memory() {
  log "Starting memory sync"

  # Rotate EVENTS.jsonl if it exceeds 1000 lines
  EVENTS_FILE="$MEMORY_DIR/orchestration/EVENTS.jsonl"
  if [ -f "$EVENTS_FILE" ]; then
    lines=$(wc -l < "$EVENTS_FILE")
    if [ "$lines" -gt 1000 ]; then
      tail -n 1000 "$EVENTS_FILE" > "$EVENTS_FILE.tmp" && mv "$EVENTS_FILE.tmp" "$EVENTS_FILE"
      log "Rotated EVENTS.jsonl from $lines to 1000 lines"
    fi
  fi

  # Fallback to reading Convex URL from .env if CMUX_CALLBACK_URL not set
  if [ -z "\${CMUX_CALLBACK_URL:-}" ]; then
    if [ -f "/root/workspace/.env" ]; then
      # Try CONVEX_SITE_URL first (preferred for HTTP actions), then CONVEX_SELF_HOSTED_URL
      CMUX_CALLBACK_URL=$(grep -E "^CONVEX_SITE_URL=" /root/workspace/.env 2>/dev/null | cut -d= -f2- | tr -d ' ')
      if [ -z "\${CMUX_CALLBACK_URL:-}" ]; then
        CMUX_CALLBACK_URL=$(grep -E "^CONVEX_SELF_HOSTED_URL=" /root/workspace/.env 2>/dev/null | cut -d= -f2- | tr -d ' ')
      fi
      if [ -n "\${CMUX_CALLBACK_URL:-}" ]; then
        log "Loaded CMUX_CALLBACK_URL from .env: \${CMUX_CALLBACK_URL}"
      fi
    fi
  fi

  # Check required env vars
  if [ -z "\${CMUX_CALLBACK_URL:-}" ] || [ -z "\${CMUX_TASK_RUN_JWT:-}" ]; then
    log "Missing required env vars (CMUX_CALLBACK_URL or CMUX_TASK_RUN_JWT), skipping sync"
    return 0
  fi

  # Check if jq is available
  if ! command -v jq >/dev/null 2>&1; then
    log "jq not found, skipping sync"
    return 0
  fi

  # Build JSON array of files
  files_json="[]"

  # Sync knowledge/MEMORY.md
  if [ -f "$MEMORY_DIR/knowledge/MEMORY.md" ]; then
    content=$(head -c $MAX_SIZE "$MEMORY_DIR/knowledge/MEMORY.md" | jq -Rs .)
    files_json=$(echo "$files_json" | jq --argjson c "$content" '. + [{"memoryType": "knowledge", "content": ($c), "fileName": "knowledge/MEMORY.md"}]')
    log "Added knowledge/MEMORY.md"
  fi

  # Sync daily logs (find all .md files in daily/)
  if [ -d "$MEMORY_DIR/daily" ]; then
    for daily_file in "$MEMORY_DIR/daily"/*.md; do
      if [ -f "$daily_file" ]; then
        filename=$(basename "$daily_file")
        date_str="\${filename%.md}"
        content=$(head -c $MAX_SIZE "$daily_file" | jq -Rs .)
        files_json=$(echo "$files_json" | jq --argjson c "$content" --arg d "$date_str" --arg f "daily/$filename" '. + [{"memoryType": "daily", "content": ($c), "fileName": ($f), "date": ($d)}]')
        log "Added daily/$filename"
      fi
    done
  fi

  # Sync TASKS.json
  if [ -f "$MEMORY_DIR/TASKS.json" ]; then
    content=$(head -c $MAX_SIZE "$MEMORY_DIR/TASKS.json" | jq -Rs .)
    files_json=$(echo "$files_json" | jq --argjson c "$content" '. + [{"memoryType": "tasks", "content": ($c), "fileName": "TASKS.json"}]')
    log "Added TASKS.json"
  fi

  # Sync MAILBOX.json
  if [ -f "$MEMORY_DIR/MAILBOX.json" ]; then
    content=$(head -c $MAX_SIZE "$MEMORY_DIR/MAILBOX.json" | jq -Rs .)
    files_json=$(echo "$files_json" | jq --argjson c "$content" '. + [{"memoryType": "mailbox", "content": ($c), "fileName": "MAILBOX.json"}]')
    log "Added MAILBOX.json"
  fi

  # Sync orchestration/EVENTS.jsonl (orchestration event stream)
  if [ -f "$MEMORY_DIR/orchestration/EVENTS.jsonl" ]; then
    content=$(head -c $MAX_SIZE "$MEMORY_DIR/orchestration/EVENTS.jsonl" | jq -Rs .)
    files_json=$(echo "$files_json" | jq --argjson c "$content" '. + [{"memoryType": "events", "content": ($c), "fileName": "orchestration/EVENTS.jsonl"}]')
    log "Added orchestration/EVENTS.jsonl"
  fi

  # Sync behavior/HOT.md (self-improving behavior rules)
  if [ -f "$MEMORY_DIR/behavior/HOT.md" ]; then
    content=$(head -c $MAX_SIZE "$MEMORY_DIR/behavior/HOT.md" | jq -Rs .)
    files_json=$(echo "$files_json" | jq --argjson c "$content" '. + [{"memoryType": "behavior_hot", "content": ($c), "fileName": "behavior/HOT.md"}]')
    log "Added behavior/HOT.md"
  fi

  # Sync behavior/corrections.jsonl (correction log)
  if [ -f "$MEMORY_DIR/behavior/corrections.jsonl" ] && [ -s "$MEMORY_DIR/behavior/corrections.jsonl" ]; then
    content=$(head -c $MAX_SIZE "$MEMORY_DIR/behavior/corrections.jsonl" | jq -Rs .)
    files_json=$(echo "$files_json" | jq --argjson c "$content" '. + [{"memoryType": "behavior_corrections", "content": ($c), "fileName": "behavior/corrections.jsonl"}]')
    log "Added behavior/corrections.jsonl"
  fi

  # Sync behavior/index.json (behavior metadata)
  if [ -f "$MEMORY_DIR/behavior/index.json" ]; then
    content=$(head -c $MAX_SIZE "$MEMORY_DIR/behavior/index.json" | jq -Rs .)
    files_json=$(echo "$files_json" | jq --argjson c "$content" '. + [{"memoryType": "behavior_index", "content": ($c), "fileName": "behavior/index.json"}]')
    log "Added behavior/index.json"
  fi

  # Sync behavior domain files
  if [ -d "$MEMORY_DIR/behavior/domains" ]; then
    for domain_file in "$MEMORY_DIR/behavior/domains"/*.md; do
      if [ -f "$domain_file" ]; then
        filename=$(basename "$domain_file")
        content=$(head -c $MAX_SIZE "$domain_file" | jq -Rs .)
        files_json=$(echo "$files_json" | jq --argjson c "$content" --arg f "behavior/domains/$filename" '. + [{"memoryType": "behavior_domain", "content": ($c), "fileName": ($f)}]')
        log "Added behavior/domains/$filename"
      fi
    done
  fi

  # Sync behavior project files
  if [ -d "$MEMORY_DIR/behavior/projects" ]; then
    for project_file in "$MEMORY_DIR/behavior/projects"/*.md; do
      if [ -f "$project_file" ]; then
        filename=$(basename "$project_file")
        content=$(head -c $MAX_SIZE "$project_file" | jq -Rs .)
        files_json=$(echo "$files_json" | jq --argjson c "$content" --arg f "behavior/projects/$filename" '. + [{"memoryType": "behavior_project", "content": ($c), "fileName": ($f)}]')
        log "Added behavior/projects/$filename"
      fi
    done
  fi

  # Check if we have any files to sync
  file_count=$(echo "$files_json" | jq 'length')
  if [ "$file_count" -eq 0 ]; then
    log "No memory files found to sync"
    return 0
  fi

  # Build final payload
  payload=$(jq -n --argjson files "$files_json" '{"files": $files}')
  log "Syncing $file_count files to Convex"

  # POST to Convex (Convex-Client header required for self-hosted Convex)
  response=$(curl -s -w "\\n%{http_code}" -X POST "\${CMUX_CALLBACK_URL}/api/memory/sync" \\
    -H "Content-Type: application/json" \\
    -H "Convex-Client: node-1.0.0" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$payload" 2>>"$LOG_FILE")

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" = "200" ]; then
    log "Memory sync successful: $body"
  else
    log "Memory sync failed with HTTP $http_code: $body"
  fi
}

# Run sync with best-effort error handling
sync_memory 2>>"$LOG_FILE" || {
  exit_code=$?
  echo "[$(date -Iseconds)] Memory sync failed with exit code $exit_code" >> "$LOG_FILE"
}

exit 0
`;
}

/**
 * Get the AuthFile for the memory sync script.
 * This is deployed to /root/lifecycle/memory/sync.sh with execute permissions.
 */
export function getMemorySyncScriptFile(): AuthFile {
  const Buffer = globalThis.Buffer;
  return {
    destinationPath: `${MEMORY_PROTOCOL_DIR}/sync.sh`,
    contentBase64: Buffer.from(getMemorySyncScript()).toString("base64"),
    mode: "755",
  };
}

/**
 * Generate the MCP server script that exposes memory files as tools.
 * This runs as a stdio-based MCP server that Claude can query programmatically.
 *
 * Read Tools:
 * - read_memory(type): Read memory file content (knowledge, tasks, mailbox)
 * - list_daily_logs(): List available daily log dates
 * - read_daily_log(date): Read a specific daily log
 * - search_memory(query): Search across all memory files
 *
 * Messaging Tools:
 * - send_message(to, message, type): Send a message to another agent
 * - get_my_messages(): Get messages addressed to this agent
 * - mark_read(messageId): Mark a message as read
 *
 * Write Tools:
 * - append_daily_log(content): Append content to today's daily log
 * - update_knowledge(section, content): Update a priority section in MEMORY.md
 * - add_task(subject, description): Add a new task to TASKS.json
 * - update_task(taskId, status): Update task status in TASKS.json
 *
 * Orchestration Tools:
 * - read_orchestration(type): Read PLAN.json, AGENTS.json, or EVENTS.jsonl
 * - append_event(event, message, ...): Append event to EVENTS.jsonl
 * - update_plan_task(taskId, status, ...): Update task status in PLAN.json
 */
export function getMemoryMcpServerScript(): string {
  return `#!/usr/bin/env node
/**
 * cmux Memory MCP Server
 * Exposes agent memory files as MCP tools for programmatic access.
 * Uses stdio transport for simplicity in sandbox environments.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

const MEMORY_DIR = '${MEMORY_PROTOCOL_DIR}';
const KNOWLEDGE_DIR = path.join(MEMORY_DIR, 'knowledge');
const DAILY_DIR = path.join(MEMORY_DIR, 'daily');
const ORCHESTRATION_DIR = path.join(MEMORY_DIR, 'orchestration');
const MAILBOX_PATH = path.join(MEMORY_DIR, 'MAILBOX.json');
const TASKS_PATH = path.join(MEMORY_DIR, 'TASKS.json');
const PLAN_PATH = path.join(ORCHESTRATION_DIR, 'PLAN.json');
const AGENTS_PATH = path.join(ORCHESTRATION_DIR, 'AGENTS.json');
const EVENTS_PATH = path.join(ORCHESTRATION_DIR, 'EVENTS.jsonl');

// Get agent name from environment (set by cmux)
const AGENT_NAME = process.env.CMUX_AGENT_NAME || 'unknown';

// Simple JSON-RPC over stdio implementation
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

function sendResponse(id, result, error) {
  const response = {
    jsonrpc: '2.0',
    id
  };
  if (error) {
    response.error = { code: -32000, message: error };
  } else {
    response.result = result;
  }
  console.log(JSON.stringify(response));
}

function readFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    return null;
  }
}

function writeFile(filePath, content) {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (err) {
    return false;
  }
}

function readMailbox() {
  const content = readFile(MAILBOX_PATH);
  if (!content) {
    return { version: 1, messages: [] };
  }
  try {
    return JSON.parse(content);
  } catch (err) {
    return { version: 1, messages: [] };
  }
}

function writeMailbox(mailbox) {
  return writeFile(MAILBOX_PATH, JSON.stringify(mailbox, null, 2));
}

function generateMessageId() {
  return 'msg_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

function generateTaskId() {
  return 'task_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

function getTodayDateString() {
  const iso = new Date().toISOString();
  return iso.slice(0, iso.indexOf('T'));
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readTasks() {
  const content = readFile(TASKS_PATH);
  if (!content) return { version: 1, tasks: [] };
  try {
    return JSON.parse(content);
  } catch (err) {
    return { version: 1, tasks: [] };
  }
}

function writeTasks(tasks) {
  return writeFile(TASKS_PATH, JSON.stringify(tasks, null, 2));
}

function readPlan() {
  const content = readFile(PLAN_PATH);
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch (err) {
    return null;
  }
}

function writePlan(plan) {
  ensureDir(ORCHESTRATION_DIR);
  plan.updatedAt = new Date().toISOString();
  return writeFile(PLAN_PATH, JSON.stringify(plan, null, 2));
}

function appendEvent(event) {
  ensureDir(ORCHESTRATION_DIR);
  const line = JSON.stringify(event) + '\\n';
  try {
    fs.appendFileSync(EVENTS_PATH, line, 'utf-8');
    return true;
  } catch (err) {
    return false;
  }
}

function listDailyLogs() {
  try {
    if (!fs.existsSync(DAILY_DIR)) {
      return [];
    }
    const files = fs.readdirSync(DAILY_DIR);
    return files
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''))
      .sort()
      .reverse();
  } catch (err) {
    return [];
  }
}

function searchMemory(query) {
  const results = [];
  const lowerQuery = query.toLowerCase();

  // Search knowledge
  const knowledge = readFile(path.join(KNOWLEDGE_DIR, 'MEMORY.md'));
  if (knowledge && knowledge.toLowerCase().includes(lowerQuery)) {
    const lines = knowledge.split('\\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(lowerQuery)) {
        results.push({
          source: 'knowledge/MEMORY.md',
          line: i + 1,
          content: lines[i].trim()
        });
      }
    }
  }

  // Search tasks
  const tasks = readFile(path.join(MEMORY_DIR, 'TASKS.json'));
  if (tasks && tasks.toLowerCase().includes(lowerQuery)) {
    results.push({
      source: 'TASKS.json',
      content: 'Match found in tasks file'
    });
  }

  // Search mailbox
  const mailbox = readFile(path.join(MEMORY_DIR, 'MAILBOX.json'));
  if (mailbox && mailbox.toLowerCase().includes(lowerQuery)) {
    results.push({
      source: 'MAILBOX.json',
      content: 'Match found in mailbox file'
    });
  }

  // Search daily logs
  const dailyLogs = listDailyLogs();
  for (const date of dailyLogs.slice(0, 7)) { // Only search last 7 days
    const logContent = readFile(path.join(DAILY_DIR, date + '.md'));
    if (logContent && logContent.toLowerCase().includes(lowerQuery)) {
      const lines = logContent.split('\\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lowerQuery)) {
          results.push({
            source: 'daily/' + date + '.md',
            line: i + 1,
            content: lines[i].trim()
          });
        }
      }
    }
  }

  return results;
}

// MCP protocol handlers
const tools = [
  {
    name: 'read_memory',
    description: 'Read a memory file. Type can be "knowledge", "tasks", or "mailbox".',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['knowledge', 'tasks', 'mailbox'],
          description: 'The type of memory to read'
        }
      },
      required: ['type']
    }
  },
  {
    name: 'list_daily_logs',
    description: 'List available daily log dates (newest first).',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'read_daily_log',
    description: 'Read a specific daily log by date (YYYY-MM-DD format).',
    inputSchema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'The date in YYYY-MM-DD format'
        }
      },
      required: ['date']
    }
  },
  {
    name: 'search_memory',
    description: 'Search across all memory files for a query string.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'send_message',
    description: 'Send a message to another agent on the same task. Use "*" to broadcast to all agents.',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient agent name (e.g., "claude/opus-4.5") or "*" for broadcast'
        },
        message: {
          type: 'string',
          description: 'The message content'
        },
        type: {
          type: 'string',
          enum: ['handoff', 'request', 'status'],
          description: 'Message type: handoff (work transfer), request (ask to do something), status (progress update)'
        }
      },
      required: ['to', 'message']
    }
  },
  {
    name: 'get_my_messages',
    description: 'Get all messages addressed to this agent (including broadcasts). Returns unread messages first.',
    inputSchema: {
      type: 'object',
      properties: {
        includeRead: {
          type: 'boolean',
          description: 'Include messages already marked as read (default: false)'
        }
      }
    }
  },
  {
    name: 'mark_read',
    description: 'Mark a message as read by its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        messageId: {
          type: 'string',
          description: 'The message ID to mark as read'
        }
      },
      required: ['messageId']
    }
  },
  // Write tools
  {
    name: 'append_daily_log',
    description: 'Append content to today\\'s daily log. Creates the file if it doesn\\'t exist.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Content to append to the daily log'
        }
      },
      required: ['content']
    }
  },
  {
    name: 'update_knowledge',
    description: 'Update a specific priority section in the knowledge file (MEMORY.md). Appends a new entry with today\\'s date.',
    inputSchema: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          enum: ['P0', 'P1', 'P2'],
          description: 'Priority section to update (P0=Core, P1=Active, P2=Reference)'
        },
        content: {
          type: 'string',
          description: 'Content to add to the section (will be prefixed with today\\'s date)'
        }
      },
      required: ['section', 'content']
    }
  },
  {
    name: 'add_task',
    description: 'Add a new task to the TASKS.json file.',
    inputSchema: {
      type: 'object',
      properties: {
        subject: {
          type: 'string',
          description: 'Brief title for the task'
        },
        description: {
          type: 'string',
          description: 'Detailed description of what needs to be done'
        }
      },
      required: ['subject', 'description']
    }
  },
  {
    name: 'update_task',
    description: 'Update the status of an existing task in TASKS.json.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The ID of the task to update'
        },
        status: {
          type: 'string',
          enum: ['pending', 'in_progress', 'completed'],
          description: 'New status for the task'
        }
      },
      required: ['taskId', 'status']
    }
  },
  // Orchestration tools
  {
    name: 'read_orchestration',
    description: 'Read an orchestration file (PLAN.json, AGENTS.json, or EVENTS.jsonl).',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['plan', 'agents', 'events'],
          description: 'Type of orchestration file to read'
        }
      },
      required: ['type']
    }
  },
  {
    name: 'append_event',
    description: 'Append an orchestration event to EVENTS.jsonl.',
    inputSchema: {
      type: 'object',
      properties: {
        event: {
          type: 'string',
          description: 'Event type (e.g., agent_spawned, agent_completed, message_sent)'
        },
        message: {
          type: 'string',
          description: 'Human-readable message describing the event'
        },
        agentName: {
          type: 'string',
          description: 'Agent name associated with the event (optional)'
        },
        taskRunId: {
          type: 'string',
          description: 'Task run ID associated with the event (optional)'
        }
      },
      required: ['event', 'message']
    }
  },
  {
    name: 'update_plan_task',
    description: 'Update the status of a task in the orchestration PLAN.json.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The ID of the orchestration task to update'
        },
        status: {
          type: 'string',
          description: 'New status (pending, assigned, running, completed, failed, cancelled)'
        },
        result: {
          type: 'string',
          description: 'Result message (for completed tasks)'
        },
        errorMessage: {
          type: 'string',
          description: 'Error message (for failed tasks)'
        }
      },
      required: ['taskId', 'status']
    }
  },
  // TTL pruning tool
  {
    name: 'check_stale_entries',
    description: 'Check for stale entries in MEMORY.md based on TTL rules. P1 entries older than 90 days and P2 entries older than 30 days are considered stale. Returns list of stale entries that should be reviewed for promotion or removal.',
    inputSchema: {
      type: 'object',
      properties: {
        autoRemove: {
          type: 'boolean',
          description: 'If true, automatically remove stale entries (default: false, just report)'
        }
      }
    }
  },
  // Orchestration head agent tool (Phase 1)
  {
    name: 'pull_orchestration_updates',
    description: 'Pull the latest orchestration state from the server. For head agents to sync local PLAN.json with remote task statuses, unread messages, and completion counts. Returns aggregated state from all sub-agents.',
    inputSchema: {
      type: 'object',
      properties: {
        orchestrationId: {
          type: 'string',
          description: 'Optional orchestration ID to filter tasks (defaults to current orchestration)'
        },
        syncToPlan: {
          type: 'boolean',
          description: 'If true, automatically update local PLAN.json with remote state (default: true)'
        }
      }
    }
  },
  // Behavior memory tools (self-improving preferences)
  {
    name: 'read_behavior',
    description: 'Read behavior memory files (HOT.md, corrections.jsonl, index.json, or domain/project rules).',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['hot', 'corrections', 'index', 'domain', 'project'],
          description: 'Type of behavior memory to read'
        },
        name: {
          type: 'string',
          description: 'For domain/project types, the name of the domain or project file (without .md extension)'
        }
      },
      required: ['type']
    }
  },
  {
    name: 'add_behavior_rule',
    description: 'Add a new rule to behavior/HOT.md. Rules capture workflow preferences learned from user feedback.',
    inputSchema: {
      type: 'object',
      properties: {
        rule: {
          type: 'string',
          description: 'The rule text (e.g., "Always use bun instead of npm")'
        },
        confirmed: {
          type: 'boolean',
          description: 'If true, mark the rule as [confirmed] (user-verified). Default: false'
        }
      },
      required: ['rule']
    }
  },
  {
    name: 'log_correction',
    description: 'Log a correction to behavior/corrections.jsonl. Use when the user corrects your action.',
    inputSchema: {
      type: 'object',
      properties: {
        wrongAction: {
          type: 'string',
          description: 'What you did wrong'
        },
        correctAction: {
          type: 'string',
          description: 'What the user said to do instead'
        },
        context: {
          type: 'string',
          description: 'Optional context about when this applies'
        },
        learnedRule: {
          type: 'string',
          description: 'Optional rule to add to HOT.md based on this correction'
        },
        promoteToHot: {
          type: 'boolean',
          description: 'If true and learnedRule is provided, also add the rule to HOT.md'
        }
      },
      required: ['wrongAction', 'correctAction']
    }
  },
  {
    name: 'confirm_behavior_rule',
    description: 'Mark an existing rule in HOT.md as [confirmed]. Use when user explicitly validates a rule.',
    inputSchema: {
      type: 'object',
      properties: {
        rulePattern: {
          type: 'string',
          description: 'Text pattern to match the rule (substring match)'
        }
      },
      required: ['rulePattern']
    }
  },
  {
    name: 'check_stale_behavior',
    description: 'Check for stale or unused behavior rules. Unconfirmed rules older than 30 days or rules without recent usage are considered stale. Can optionally archive them.',
    inputSchema: {
      type: 'object',
      properties: {
        autoArchive: {
          type: 'boolean',
          description: 'If true, move stale rules to behavior/archive/ (default: false, just report)'
        },
        staleDays: {
          type: 'number',
          description: 'Number of days after which unconfirmed rules are considered stale (default: 30)'
        }
      }
    }
  },
  {
    name: 'compact_corrections',
    description: 'Compact the corrections.jsonl file by keeping only the most recent N entries. Older entries are summarized into a single archive entry.',
    inputSchema: {
      type: 'object',
      properties: {
        keepCount: {
          type: 'number',
          description: 'Number of recent corrections to keep (default: 100)'
        }
      }
    }
  },
  {
    name: 'update_behavior_index',
    description: 'Update the behavior/index.json with current stats (rule count, correction count, domains, projects). Call after making changes to behavior memory.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

function handleRequest(request) {
  const { id, method, params } = request;

  switch (method) {
    case 'initialize':
      return sendResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'cmux-memory', version: '1.0.0' }
      });

    case 'tools/list':
      return sendResponse(id, { tools });

    case 'tools/call':
      const { name, arguments: args } = params;

      switch (name) {
        case 'read_memory': {
          const typeToPath = {
            knowledge: path.join(KNOWLEDGE_DIR, 'MEMORY.md'),
            tasks: path.join(MEMORY_DIR, 'TASKS.json'),
            mailbox: path.join(MEMORY_DIR, 'MAILBOX.json')
          };
          const content = readFile(typeToPath[args.type]);
          if (content === null) {
            return sendResponse(id, { content: [{ type: 'text', text: 'File not found or empty.' }] });
          }
          return sendResponse(id, { content: [{ type: 'text', text: content }] });
        }

        case 'list_daily_logs': {
          const dates = listDailyLogs();
          return sendResponse(id, { content: [{ type: 'text', text: JSON.stringify(dates, null, 2) }] });
        }

        case 'read_daily_log': {
          const content = readFile(path.join(DAILY_DIR, args.date + '.md'));
          if (content === null) {
            return sendResponse(id, { content: [{ type: 'text', text: 'Daily log not found for date: ' + args.date }] });
          }
          return sendResponse(id, { content: [{ type: 'text', text: content }] });
        }

        case 'search_memory': {
          const results = searchMemory(args.query);
          if (results.length === 0) {
            return sendResponse(id, { content: [{ type: 'text', text: 'No matches found for: ' + args.query }] });
          }
          return sendResponse(id, { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] });
        }

        case 'send_message': {
          const mailbox = readMailbox();
          const newMessage = {
            id: generateMessageId(),
            from: AGENT_NAME,
            to: args.to,
            type: args.type || 'status',
            message: args.message,
            timestamp: new Date().toISOString(),
            read: false
          };
          mailbox.messages.push(newMessage);
          if (writeMailbox(mailbox)) {
            return sendResponse(id, { content: [{ type: 'text', text: 'Message sent successfully. ID: ' + newMessage.id }] });
          } else {
            return sendResponse(id, null, 'Failed to write mailbox');
          }
        }

        case 'get_my_messages': {
          const mailbox = readMailbox();
          const includeRead = args.includeRead || false;
          const myMessages = mailbox.messages.filter(msg => {
            const isForMe = msg.to === AGENT_NAME || msg.to === '*';
            const isFromMe = msg.from === AGENT_NAME;
            const shouldInclude = includeRead || !msg.read;
            return isForMe && !isFromMe && shouldInclude;
          });
          // Sort: unread first, then by timestamp
          myMessages.sort((a, b) => {
            if (a.read !== b.read) return a.read ? 1 : -1;
            return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
          });
          if (myMessages.length === 0) {
            return sendResponse(id, { content: [{ type: 'text', text: 'No messages for you.' }] });
          }
          return sendResponse(id, { content: [{ type: 'text', text: JSON.stringify(myMessages, null, 2) }] });
        }

        case 'mark_read': {
          const mailbox = readMailbox();
          const msgIndex = mailbox.messages.findIndex(msg => msg.id === args.messageId);
          if (msgIndex === -1) {
            return sendResponse(id, null, 'Message not found: ' + args.messageId);
          }
          mailbox.messages[msgIndex].read = true;
          if (writeMailbox(mailbox)) {
            return sendResponse(id, { content: [{ type: 'text', text: 'Message marked as read.' }] });
          } else {
            return sendResponse(id, null, 'Failed to update mailbox');
          }
        }

        // Write tool handlers
        case 'append_daily_log': {
          const today = getTodayDateString();
          ensureDir(DAILY_DIR);
          const logPath = path.join(DAILY_DIR, today + '.md');
          const existing = readFile(logPath) || '# Daily Log: ' + today + '\\n\\n> Session-specific observations. Temporary notes go here.\\n\\n---\\n';
          const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
          const newContent = existing + '\\n- [' + timestamp + '] ' + args.content;
          if (writeFile(logPath, newContent)) {
            return sendResponse(id, { content: [{ type: 'text', text: 'Appended to daily/' + today + '.md' }] });
          }
          return sendResponse(id, { content: [{ type: 'text', text: 'Failed to append to daily log' }] });
        }

        case 'update_knowledge': {
          ensureDir(KNOWLEDGE_DIR);
          const knowledgePath = path.join(KNOWLEDGE_DIR, 'MEMORY.md');
          let existing = readFile(knowledgePath);

          if (!existing) {
            existing = '# Project Knowledge\\n\\n> Curated insights organized by priority. Add date tags for TTL tracking.\\n\\n## P0 - Core (Never Expires)\\n<!-- Fundamental project facts, configuration, invariants -->\\n\\n## P1 - Active (90-day TTL)\\n<!-- Ongoing work context, current strategies, recent decisions -->\\n\\n## P2 - Reference (30-day TTL)\\n<!-- Temporary findings, debug notes, one-off context -->\\n\\n---\\n*Priority guide: P0 = permanent truth, P1 = active context, P2 = temporary reference*\\n*Format: - [YYYY-MM-DD] Your insight here*\\n';
          }

          const today = getTodayDateString();
          const newEntry = '- [' + today + '] ' + args.content;

          const sectionHeaders = {
            P0: '## P0 - Core (Never Expires)',
            P1: '## P1 - Active (90-day TTL)',
            P2: '## P2 - Reference (30-day TTL)'
          };

          const header = sectionHeaders[args.section];
          const headerIndex = existing.indexOf(header);

          if (headerIndex === -1) {
            return sendResponse(id, { content: [{ type: 'text', text: 'Section ' + args.section + ' not found in MEMORY.md' }] });
          }

          const afterHeader = existing.slice(headerIndex + header.length);
          const commentMatch = afterHeader.match(/<!--[^>]*-->\\n/);
          let insertPoint = headerIndex + header.length + 1;
          if (commentMatch && commentMatch.index !== undefined) {
            insertPoint = headerIndex + header.length + commentMatch.index + commentMatch[0].length;
          }

          const updated = existing.slice(0, insertPoint) + newEntry + '\\n' + existing.slice(insertPoint);

          if (writeFile(knowledgePath, updated)) {
            return sendResponse(id, { content: [{ type: 'text', text: 'Added entry to ' + args.section + ' section in MEMORY.md' }] });
          }
          return sendResponse(id, { content: [{ type: 'text', text: 'Failed to update MEMORY.md' }] });
        }

        case 'add_task': {
          const tasks = readTasks();
          const now = new Date().toISOString();
          const newTask = {
            id: generateTaskId(),
            subject: args.subject,
            description: args.description,
            status: 'pending',
            createdAt: now,
            updatedAt: now
          };
          tasks.tasks.push(newTask);
          if (writeTasks(tasks)) {
            return sendResponse(id, { content: [{ type: 'text', text: 'Task created with ID: ' + newTask.id }] });
          }
          return sendResponse(id, { content: [{ type: 'text', text: 'Failed to create task' }] });
        }

        case 'update_task': {
          const tasks = readTasks();
          const task = tasks.tasks.find(t => t.id === args.taskId);
          if (!task) {
            return sendResponse(id, { content: [{ type: 'text', text: 'Task ' + args.taskId + ' not found' }] });
          }
          task.status = args.status;
          task.updatedAt = new Date().toISOString();
          if (writeTasks(tasks)) {
            return sendResponse(id, { content: [{ type: 'text', text: 'Task ' + args.taskId + ' updated to status: ' + args.status }] });
          }
          return sendResponse(id, { content: [{ type: 'text', text: 'Failed to update task' }] });
        }

        // Orchestration tool handlers
        case 'read_orchestration': {
          let content = null;
          if (args.type === 'plan') {
            content = readFile(PLAN_PATH);
          } else if (args.type === 'agents') {
            content = readFile(AGENTS_PATH);
          } else if (args.type === 'events') {
            content = readFile(EVENTS_PATH);
          }
          return sendResponse(id, { content: [{ type: 'text', text: content || 'No ' + args.type + ' file found in orchestration directory.' }] });
        }

        case 'append_event': {
          const eventObj = {
            timestamp: new Date().toISOString(),
            event: args.event,
            message: args.message
          };
          if (args.agentName) eventObj.agentName = args.agentName;
          if (args.taskRunId) eventObj.taskRunId = args.taskRunId;

          if (appendEvent(eventObj)) {
            return sendResponse(id, { content: [{ type: 'text', text: 'Event appended to EVENTS.jsonl' }] });
          }
          return sendResponse(id, { content: [{ type: 'text', text: 'Failed to append event' }] });
        }

        case 'update_plan_task': {
          const plan = readPlan();
          if (!plan) {
            return sendResponse(id, { content: [{ type: 'text', text: 'No PLAN.json found in orchestration directory' }] });
          }
          const task = plan.tasks.find(t => t.id === args.taskId);
          if (!task) {
            return sendResponse(id, { content: [{ type: 'text', text: 'Task ' + args.taskId + ' not found in PLAN.json' }] });
          }
          task.status = args.status;
          if (args.result !== undefined) task.result = args.result;
          if (args.errorMessage !== undefined) task.errorMessage = args.errorMessage;
          if (args.status === 'running' && !task.startedAt) {
            task.startedAt = new Date().toISOString();
          }
          if (args.status === 'completed' || args.status === 'failed' || args.status === 'cancelled') {
            task.completedAt = new Date().toISOString();
          }

          if (writePlan(plan)) {
            return sendResponse(id, { content: [{ type: 'text', text: 'Plan task ' + args.taskId + ' updated to status: ' + args.status }] });
          }
          return sendResponse(id, { content: [{ type: 'text', text: 'Failed to update plan task' }] });
        }

        case 'check_stale_entries': {
          const knowledgePath = path.join(KNOWLEDGE_DIR, 'MEMORY.md');
          const content = readFile(knowledgePath);
          if (!content) {
            return sendResponse(id, { content: [{ type: 'text', text: 'No MEMORY.md found' }] });
          }

          const today = new Date();
          const P1_TTL_DAYS = 90;
          const P2_TTL_DAYS = 30;

          // Parse date from entry format: - [YYYY-MM-DD] content
          const datePattern = /^\\s*-\\s*\\[(\\d{4}-\\d{2}-\\d{2})\\]\\s*(.*)$/;

          const lines = content.split('\\n');
          let currentSection = null;
          const staleEntries = [];
          const linesToRemove = [];

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Track which section we're in
            if (line.includes('## P0')) currentSection = 'P0';
            else if (line.includes('## P1')) currentSection = 'P1';
            else if (line.includes('## P2')) currentSection = 'P2';
            else if (line.startsWith('## ') || line.startsWith('---')) currentSection = null;

            // Check for dated entries in P1 or P2
            if ((currentSection === 'P1' || currentSection === 'P2') && line.trim().startsWith('-')) {
              const match = line.match(datePattern);
              if (match) {
                const entryDate = new Date(match[1]);
                const daysSince = Math.floor((today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
                const ttl = currentSection === 'P1' ? P1_TTL_DAYS : P2_TTL_DAYS;

                if (daysSince > ttl) {
                  staleEntries.push({
                    section: currentSection,
                    line: i + 1,
                    date: match[1],
                    content: match[2].substring(0, 100) + (match[2].length > 100 ? '...' : ''),
                    daysSince,
                    ttl
                  });
                  linesToRemove.push(i);
                }
              }
            }
          }

          if (staleEntries.length === 0) {
            return sendResponse(id, { content: [{ type: 'text', text: 'No stale entries found. All P1/P2 entries are within TTL.' }] });
          }

          // If autoRemove is true, remove the stale lines
          if (args.autoRemove) {
            const newLines = lines.filter((_, i) => !linesToRemove.includes(i));
            if (writeFile(knowledgePath, newLines.join('\\n'))) {
              return sendResponse(id, { content: [{ type: 'text', text: 'Removed ' + staleEntries.length + ' stale entries:\\n' + JSON.stringify(staleEntries, null, 2) }] });
            }
            return sendResponse(id, { content: [{ type: 'text', text: 'Failed to update MEMORY.md' }] });
          }

          // Just report stale entries
          return sendResponse(id, { content: [{ type: 'text', text: 'Found ' + staleEntries.length + ' stale entries (use autoRemove: true to remove):\\n' + JSON.stringify(staleEntries, null, 2) }] });
        }

        // Orchestration head agent tool (Phase 1)
        case 'pull_orchestration_updates': {
          // Check required env vars for API call
          const callbackUrl = process.env.CMUX_CALLBACK_URL;
          const taskRunJwt = process.env.CMUX_TASK_RUN_JWT;

          if (!callbackUrl || !taskRunJwt) {
            return sendResponse(id, { content: [{ type: 'text', text: 'Missing required env vars (CMUX_CALLBACK_URL or CMUX_TASK_RUN_JWT). Cannot pull orchestration updates.' }] });
          }

          // Read current orchestration ID from PLAN.json if not provided
          let orchestrationId = args?.orchestrationId;
          if (!orchestrationId) {
            const plan = readPlan();
            if (plan && plan.orchestrationId) {
              orchestrationId = plan.orchestrationId;
            }
          }

          // Build URL with query params
          let pullUrl = callbackUrl + '/api/orchestration/pull';
          const params = [];
          if (orchestrationId) params.push('orchestrationId=' + encodeURIComponent(orchestrationId));
          if (params.length > 0) pullUrl += '?' + params.join('&');

          // Make HTTP request using curl via execFileSync (no shell to avoid injection)
          try {
            const { execFileSync } = require('child_process');

            // Check curl availability before attempting
            try {
              execFileSync('which', ['curl'], { encoding: 'utf-8', timeout: 5000 });
            } catch {
              return sendResponse(id, { content: [{ type: 'text', text: 'curl is not available. To pull orchestration updates manually, install curl or run:\\nwget -qO- --header="X-Task-Run-JWT: $CMUX_TASK_RUN_JWT" "' + pullUrl + '"' }] });
            }

            const curlResult = execFileSync(
              'curl',
              ['-s', '-f', '-H', 'X-Task-Run-JWT: ' + taskRunJwt, pullUrl],
              { encoding: 'utf-8', timeout: 15000 }
            );
            const data = JSON.parse(curlResult);

            // Optionally update local PLAN.json with remote state
            if (data && data.tasks) {
              const plan = readPlan() || { orchestrationId: orchestrationId || '', tasks: [] };
              plan.tasks = data.tasks;
              const planPath = MEMORY_DIR + '/orchestration/PLAN.json';
              fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
            }

            return sendResponse(id, { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
          } catch (pullErr) {
            const errMsg = pullErr instanceof Error ? pullErr.message : String(pullErr);
            return sendResponse(id, { content: [{ type: 'text', text: 'Failed to pull orchestration updates: ' + errMsg }] });
          }
        }

        // Behavior memory tool handlers
        case 'read_behavior': {
          const BEHAVIOR_DIR = path.join(MEMORY_DIR, 'behavior');
          let filePath;
          if (args.type === 'hot') {
            filePath = path.join(BEHAVIOR_DIR, 'HOT.md');
          } else if (args.type === 'corrections') {
            filePath = path.join(BEHAVIOR_DIR, 'corrections.jsonl');
          } else if (args.type === 'index') {
            filePath = path.join(BEHAVIOR_DIR, 'index.json');
          } else if (args.type === 'domain' && args.name) {
            filePath = path.join(BEHAVIOR_DIR, 'domains', args.name + '.md');
          } else if (args.type === 'project' && args.name) {
            filePath = path.join(BEHAVIOR_DIR, 'projects', args.name + '.md');
          } else {
            return sendResponse(id, { content: [{ type: 'text', text: 'Invalid behavior type or missing name for domain/project' }] });
          }
          const content = readFile(filePath);
          if (content === null) {
            return sendResponse(id, { content: [{ type: 'text', text: 'Behavior file not found: ' + filePath }] });
          }
          return sendResponse(id, { content: [{ type: 'text', text: content }] });
        }

        case 'add_behavior_rule': {
          const BEHAVIOR_DIR = path.join(MEMORY_DIR, 'behavior');
          const hotPath = path.join(BEHAVIOR_DIR, 'HOT.md');
          let content = readFile(hotPath) || '# HOT Behavior Rules\\n\\n## Rules\\n';

          // Generate unique rule ID
          const ruleId = 'rule_' + crypto.randomBytes(4).toString('hex');
          const tag = args.confirmed ? '[confirmed]' : '';
          const newRule = '- ' + tag + ' ' + args.rule + ' <!-- id:' + ruleId + ' -->';

          // Find the ## Rules section and append
          if (content.includes('## Rules')) {
            content = content.replace(/(## Rules\\n)/, '$1' + newRule + '\\n');
          } else {
            content += '\\n## Rules\\n' + newRule + '\\n';
          }

          try {
            fs.writeFileSync(hotPath, content);
            return sendResponse(id, { content: [{ type: 'text', text: 'Rule added to HOT.md: ' + newRule }] });
          } catch {
            return sendResponse(id, { content: [{ type: 'text', text: 'Failed to write HOT.md' }] });
          }
        }

        case 'log_correction': {
          const BEHAVIOR_DIR = path.join(MEMORY_DIR, 'behavior');
          const correctionsPath = path.join(BEHAVIOR_DIR, 'corrections.jsonl');
          const correctionId = 'corr_' + crypto.randomBytes(4).toString('hex');

          const correction = {
            id: correctionId,
            timestamp: new Date().toISOString(),
            wrongAction: args.wrongAction,
            correctAction: args.correctAction
          };
          if (args.context) correction.context = args.context;
          if (args.learnedRule) {
            correction.learnedRule = args.learnedRule;
            if (args.promoteToHot) correction.rulePromotedTo = 'HOT';
          }

          try {
            fs.appendFileSync(correctionsPath, JSON.stringify(correction) + '\\n');

            // Optionally promote rule to HOT.md
            if (args.learnedRule && args.promoteToHot) {
              const hotPath = path.join(BEHAVIOR_DIR, 'HOT.md');
              let hotContent = readFile(hotPath) || '# HOT Behavior Rules\\n\\n## Rules\\n';
              const ruleId = 'rule_' + crypto.randomBytes(4).toString('hex');
              const newRule = '- ' + args.learnedRule + ' <!-- id:' + ruleId + ' from:' + correctionId + ' -->';

              if (hotContent.includes('## Rules')) {
                hotContent = hotContent.replace(/(## Rules\\n)/, '$1' + newRule + '\\n');
              } else {
                hotContent += '\\n## Rules\\n' + newRule + '\\n';
              }
              fs.writeFileSync(hotPath, hotContent);
              return sendResponse(id, { content: [{ type: 'text', text: 'Correction logged and rule promoted to HOT.md. Correction ID: ' + correctionId }] });
            }

            return sendResponse(id, { content: [{ type: 'text', text: 'Correction logged. ID: ' + correctionId }] });
          } catch {
            return sendResponse(id, { content: [{ type: 'text', text: 'Failed to log correction' }] });
          }
        }

        case 'confirm_behavior_rule': {
          const BEHAVIOR_DIR = path.join(MEMORY_DIR, 'behavior');
          const hotPath = path.join(BEHAVIOR_DIR, 'HOT.md');
          let content = readFile(hotPath);
          if (!content) {
            return sendResponse(id, { content: [{ type: 'text', text: 'HOT.md not found' }] });
          }

          // Find lines matching the pattern and add [confirmed] tag if not present
          const lines = content.split('\\n');
          let found = false;
          const updatedLines = lines.map(line => {
            if (line.includes(args.rulePattern) && line.trim().startsWith('-') && !line.includes('[confirmed]')) {
              found = true;
              // Insert [confirmed] after the leading dash
              return line.replace(/^(\\s*-)\\s*/, '$1 [confirmed] ');
            }
            return line;
          });

          if (!found) {
            return sendResponse(id, { content: [{ type: 'text', text: 'No unconfirmed rule found matching pattern: ' + args.rulePattern }] });
          }

          try {
            fs.writeFileSync(hotPath, updatedLines.join('\\n'));
            return sendResponse(id, { content: [{ type: 'text', text: 'Rule confirmed in HOT.md' }] });
          } catch {
            return sendResponse(id, { content: [{ type: 'text', text: 'Failed to update HOT.md' }] });
          }
        }

        case 'check_stale_behavior': {
          const BEHAVIOR_DIR = path.join(MEMORY_DIR, 'behavior');
          const hotPath = path.join(BEHAVIOR_DIR, 'HOT.md');
          const archiveDir = path.join(BEHAVIOR_DIR, 'archive');
          const content = readFile(hotPath);

          if (!content) {
            return sendResponse(id, { content: [{ type: 'text', text: 'HOT.md not found' }] });
          }

          const staleDays = args.staleDays || 30;
          const today = new Date();
          const staleThreshold = new Date(today.getTime() - staleDays * 24 * 60 * 60 * 1000);

          // Parse rules to find stale ones (unconfirmed and old)
          const lines = content.split('\\n');
          const staleRules = [];
          const keptLines = [];

          for (const line of lines) {
            if (line.trim().startsWith('-') && !line.includes('[confirmed]')) {
              // Check for date in comment: <!-- id:xxx date:YYYY-MM-DD -->
              const dateMatch = line.match(/date:(\\d{4}-\\d{2}-\\d{2})/);
              if (dateMatch) {
                const ruleDate = new Date(dateMatch[1]);
                if (ruleDate < staleThreshold) {
                  staleRules.push(line.trim());
                  continue;
                }
              }
            }
            keptLines.push(line);
          }

          if (staleRules.length === 0) {
            return sendResponse(id, { content: [{ type: 'text', text: 'No stale rules found (threshold: ' + staleDays + ' days)' }] });
          }

          if (args.autoArchive) {
            try {
              // Write stale rules to archive
              const archivePath = path.join(archiveDir, 'archived-' + today.toISOString().split('T')[0] + '.md');
              const archiveContent = '# Archived Rules (' + today.toISOString().split('T')[0] + ')\\n\\n' + staleRules.map(r => r).join('\\n') + '\\n';
              fs.mkdirSync(archiveDir, { recursive: true });
              fs.writeFileSync(archivePath, archiveContent);

              // Update HOT.md without stale rules
              fs.writeFileSync(hotPath, keptLines.join('\\n'));

              return sendResponse(id, { content: [{ type: 'text', text: 'Archived ' + staleRules.length + ' stale rules to ' + archivePath }] });
            } catch {
              return sendResponse(id, { content: [{ type: 'text', text: 'Failed to archive stale rules' }] });
            }
          }

          return sendResponse(id, { content: [{ type: 'text', text: 'Found ' + staleRules.length + ' stale rules:\\n' + staleRules.join('\\n') }] });
        }

        case 'compact_corrections': {
          const BEHAVIOR_DIR = path.join(MEMORY_DIR, 'behavior');
          const correctionsPath = path.join(BEHAVIOR_DIR, 'corrections.jsonl');
          const content = readFile(correctionsPath);

          if (!content) {
            return sendResponse(id, { content: [{ type: 'text', text: 'No corrections.jsonl found' }] });
          }

          const lines = content.split('\\n').filter(l => l.trim());
          const keepCount = args.keepCount || 100;

          if (lines.length <= keepCount) {
            return sendResponse(id, { content: [{ type: 'text', text: 'Corrections file has ' + lines.length + ' entries, no compaction needed (threshold: ' + keepCount + ')' }] });
          }

          const toArchive = lines.slice(0, lines.length - keepCount);
          const toKeep = lines.slice(lines.length - keepCount);

          try {
            // Create archive summary
            const archiveSummary = {
              id: 'archive_' + crypto.randomBytes(4).toString('hex'),
              timestamp: new Date().toISOString(),
              type: 'archive_summary',
              count: toArchive.length,
              dateRange: {
                from: JSON.parse(toArchive[0]).timestamp,
                to: JSON.parse(toArchive[toArchive.length - 1]).timestamp
              }
            };

            // Write compacted file
            fs.writeFileSync(correctionsPath, JSON.stringify(archiveSummary) + '\\n' + toKeep.join('\\n') + '\\n');

            return sendResponse(id, { content: [{ type: 'text', text: 'Compacted corrections: archived ' + toArchive.length + ' entries, kept ' + toKeep.length }] });
          } catch {
            return sendResponse(id, { content: [{ type: 'text', text: 'Failed to compact corrections' }] });
          }
        }

        case 'update_behavior_index': {
          const BEHAVIOR_DIR = path.join(MEMORY_DIR, 'behavior');
          const indexPath = path.join(BEHAVIOR_DIR, 'index.json');
          const hotPath = path.join(BEHAVIOR_DIR, 'HOT.md');
          const correctionsPath = path.join(BEHAVIOR_DIR, 'corrections.jsonl');
          const domainsDir = path.join(BEHAVIOR_DIR, 'domains');
          const projectsDir = path.join(BEHAVIOR_DIR, 'projects');
          const archiveDir = path.join(BEHAVIOR_DIR, 'archive');

          try {
            // Count HOT rules
            const hotContent = readFile(hotPath) || '';
            const hotRules = (hotContent.match(/^\\s*-\\s/gm) || []).length;

            // Count corrections
            const correctionsContent = readFile(correctionsPath) || '';
            const corrections = correctionsContent.split('\\n').filter(l => l.trim()).length;

            // List domains
            let domains = [];
            try {
              domains = fs.readdirSync(domainsDir).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''));
            } catch { /* ignore */ }

            // List projects
            let projects = [];
            try {
              projects = fs.readdirSync(projectsDir).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''));
            } catch { /* ignore */ }

            // Count archived rules
            let archivedRules = 0;
            try {
              const archiveFiles = fs.readdirSync(archiveDir).filter(f => f.endsWith('.md'));
              for (const af of archiveFiles) {
                const archiveContent = readFile(path.join(archiveDir, af)) || '';
                archivedRules += (archiveContent.match(/^\\s*-\\s/gm) || []).length;
              }
            } catch { /* ignore */ }

            const index = {
              version: 1,
              lastUpdated: new Date().toISOString(),
              stats: {
                hotRules,
                corrections,
                domains,
                projects,
                archivedRules
              }
            };

            fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
            return sendResponse(id, { content: [{ type: 'text', text: 'Index updated: ' + JSON.stringify(index.stats) }] });
          } catch {
            return sendResponse(id, { content: [{ type: 'text', text: 'Failed to update index' }] });
          }
        }

        default:
          return sendResponse(id, null, 'Unknown tool: ' + name);
      }

    default:
      return sendResponse(id, null, 'Unknown method: ' + method);
  }
}

// Read JSON-RPC messages line by line
rl.on('line', (line) => {
  try {
    const request = JSON.parse(line);
    handleRequest(request);
  } catch (err) {
    // Ignore parse errors
  }
});

// Send initialized notification
process.stderr.write('[cmux-memory] MCP server started\\n');
`;
}

/**
 * Get the AuthFile for the MCP server script.
 * This is deployed to /root/lifecycle/memory/mcp-server.js with execute permissions.
 */
export function getMemoryMcpServerFile(): AuthFile {
  const Buffer = globalThis.Buffer;
  return {
    destinationPath: `${MEMORY_PROTOCOL_DIR}/mcp-server.js`,
    contentBase64: Buffer.from(getMemoryMcpServerScript()).toString("base64"),
    mode: "755",
  };
}

/**
 * Orchestration seed options for multi-agent coordination
 */
export interface OrchestrationSeedOptions {
  headAgent: string;
  orchestrationId?: string;
  description?: string;
  previousPlan?: string;
  previousAgents?: string;
  /** Set to true to mark this agent as an orchestration head (spawns sub-agents) */
  isOrchestrationHead?: boolean;
}

/**
 * Get auth files for orchestration memory content.
 * These files are written to the orchestration/ subdirectory.
 *
 * @param options - Orchestration seed options
 */
export function getOrchestrationSeedFiles(
  options: OrchestrationSeedOptions
): AuthFile[] {
  const Buffer = globalThis.Buffer;
  const orchestrationId = options.orchestrationId ?? generateOrchestrationId();

  // Use previous plan if provided, otherwise create new
  const planContent =
    options.previousPlan && options.previousPlan.trim().length > 0
      ? options.previousPlan
      : getOrchestrationPlanSeedContent(
          options.headAgent,
          orchestrationId,
          options.description
        );

  // Use previous agents registry if provided, otherwise create new
  const agentsContent =
    options.previousAgents && options.previousAgents.trim().length > 0
      ? options.previousAgents
      : getAgentsRegistrySeedContent(options.headAgent, orchestrationId);

  const files: AuthFile[] = [
    {
      destinationPath: `${MEMORY_ORCHESTRATION_DIR}/PLAN.json`,
      contentBase64: Buffer.from(planContent).toString("base64"),
      mode: "644",
    },
    {
      destinationPath: `${MEMORY_ORCHESTRATION_DIR}/AGENTS.json`,
      contentBase64: Buffer.from(agentsContent).toString("base64"),
      mode: "644",
    },
    // EVENTS.jsonl is created empty - events are appended during execution
    {
      destinationPath: `${MEMORY_ORCHESTRATION_DIR}/EVENTS.jsonl`,
      contentBase64: Buffer.from("").toString("base64"),
      mode: "644",
    },
  ];

  // Include head agent instructions when this is an orchestration head
  if (options.isOrchestrationHead) {
    files.push({
      destinationPath: `${MEMORY_ORCHESTRATION_DIR}/HEAD_AGENT_INSTRUCTIONS.md`,
      contentBase64: Buffer.from(getHeadAgentInstructions()).toString("base64"),
      mode: "644",
    });
  }

  return files;
}

/**
 * Get auth files for memory protocol seed content.
 * These files are written to the sandbox at startup.
 * Files are placed at /root/lifecycle/memory/ (outside git workspace).
 *
 * Two-tier structure:
 * - TASKS.json, MAILBOX.json at root
 * - knowledge/MEMORY.md for permanent insights
 * - daily/{date}.md for session-specific notes
 * - sync.sh for memory sync to Convex
 *
 * @param sandboxId - The sandbox/task run ID for metadata
 * @param previousKnowledge - Optional previous knowledge content from earlier runs (for cross-run seeding)
 * @param previousMailbox - Optional previous mailbox content with unread messages (for cross-run seeding)
 * @param orchestrationOptions - Optional orchestration seed options for multi-agent mode
 * @param previousBehavior - Optional previous behavior HOT content (for cross-run seeding)
 */
export function getMemorySeedFiles(
  sandboxId: string,
  previousKnowledge?: string,
  previousMailbox?: string,
  orchestrationOptions?: OrchestrationSeedOptions,
  previousBehavior?: string
): AuthFile[] {
  const Buffer = globalThis.Buffer;
  const today = getTodayDateString();

  // Use previous knowledge if provided and non-empty, otherwise use default template
  const knowledgeContent =
    previousKnowledge && previousKnowledge.trim().length > 0
      ? previousKnowledge
      : getKnowledgeSeedContent();

  // Use previous mailbox if provided (with unread messages), otherwise empty mailbox
  const mailboxContent =
    previousMailbox && previousMailbox.trim().length > 0
      ? previousMailbox
      : getMailboxSeedContent();

  // Use previous behavior HOT if provided, otherwise use default template
  const behaviorHotContent =
    previousBehavior && previousBehavior.trim().length > 0
      ? previousBehavior
      : getBehaviorHotSeedContent();

  const files: AuthFile[] = [
    {
      destinationPath: `${MEMORY_PROTOCOL_DIR}/TASKS.json`,
      contentBase64: Buffer.from(getTasksSeedContent(sandboxId)).toString(
        "base64"
      ),
      mode: "644",
    },
    {
      destinationPath: `${MEMORY_KNOWLEDGE_DIR}/MEMORY.md`,
      contentBase64: Buffer.from(knowledgeContent).toString("base64"),
      mode: "644",
    },
    {
      destinationPath: `${MEMORY_DAILY_DIR}/${today}.md`,
      contentBase64: Buffer.from(getDailyLogSeedContent(today)).toString(
        "base64"
      ),
      mode: "644",
    },
    {
      destinationPath: `${MEMORY_PROTOCOL_DIR}/MAILBOX.json`,
      contentBase64: Buffer.from(mailboxContent).toString("base64"),
      mode: "644",
    },
    // Behavior memory files (Layer 3)
    {
      destinationPath: `${MEMORY_BEHAVIOR_DIR}/HOT.md`,
      contentBase64: Buffer.from(behaviorHotContent).toString("base64"),
      mode: "644",
    },
    {
      destinationPath: `${MEMORY_BEHAVIOR_DIR}/corrections.jsonl`,
      contentBase64: Buffer.from(getBehaviorCorrectionsSeedContent()).toString(
        "base64"
      ),
      mode: "644",
    },
    {
      destinationPath: `${MEMORY_BEHAVIOR_DIR}/index.json`,
      contentBase64: Buffer.from(getBehaviorIndexSeedContent()).toString(
        "base64"
      ),
      mode: "644",
    },
    // .keep files for empty directories
    {
      destinationPath: `${MEMORY_BEHAVIOR_DOMAINS_DIR}/.keep`,
      contentBase64: Buffer.from("").toString("base64"),
      mode: "644",
    },
    {
      destinationPath: `${MEMORY_BEHAVIOR_PROJECTS_DIR}/.keep`,
      contentBase64: Buffer.from("").toString("base64"),
      mode: "644",
    },
    {
      destinationPath: `${MEMORY_BEHAVIOR_ARCHIVE_DIR}/.keep`,
      contentBase64: Buffer.from("").toString("base64"),
      mode: "644",
    },
    // Orchestration learning JSONL files
    {
      destinationPath: MEMORY_BEHAVIOR_LEARNINGS_PATH,
      contentBase64: Buffer.from(getBehaviorLearningsSeedContent()).toString("base64"),
      mode: "644",
    },
    {
      destinationPath: MEMORY_BEHAVIOR_ERRORS_PATH,
      contentBase64: Buffer.from(getBehaviorErrorsSeedContent()).toString("base64"),
      mode: "644",
    },
    {
      destinationPath: MEMORY_BEHAVIOR_FEATURE_REQUESTS_PATH,
      contentBase64: Buffer.from(getBehaviorFeatureRequestsSeedContent()).toString("base64"),
      mode: "644",
    },
    {
      destinationPath: MEMORY_BEHAVIOR_SKILL_CANDIDATES_PATH,
      contentBase64: Buffer.from(getBehaviorSkillCandidatesSeedContent()).toString("base64"),
      mode: "644",
    },
    // Include sync script for memory sync to Convex
    getMemorySyncScriptFile(),
    // Include MCP server for programmatic memory access (S6)
    getMemoryMcpServerFile(),
  ];

  // Add orchestration files if options provided
  if (orchestrationOptions) {
    files.push(...getOrchestrationSeedFiles(orchestrationOptions));
  }

  return files;
}

/**
 * GitHub Projects v2 context file for sandbox agents (Phase 5).
 *
 * When a task is linked to a GitHub Project item, this file is injected at
 * `/root/lifecycle/project-context.json` so agents can read their project
 * context and reference the item when producing execution summaries.
 */
export function getProjectContextFile(context: {
  projectId: string;
  projectItemId: string;
  installationId: number;
  owner: string;
  ownerType: string;
  taskRunJwt: string;
  callbackUrl: string;
}): AuthFile {
  const Buffer = globalThis.Buffer;
  const content = JSON.stringify(
    {
      githubProjectId: context.projectId,
      githubProjectItemId: context.projectItemId,
      githubProjectInstallationId: context.installationId,
      githubProjectOwner: context.owner,
      githubProjectOwnerType: context.ownerType,
      syncAuth: {
        jwt: context.taskRunJwt,
        callbackUrl: context.callbackUrl,
      },
    },
    null,
    2,
  );

  return {
    destinationPath: "/root/lifecycle/project-context.json",
    contentBase64: Buffer.from(content).toString("base64"),
    mode: "644",
  };
}

/**
 * Agent Policy Rule interface for instruction generation.
 * This mirrors the Convex table structure but only includes fields needed for injection.
 */
export interface PolicyRuleForInstructions {
  ruleId: string;
  name: string;
  category: "git_policy" | "security" | "workflow" | "tool_restriction" | "custom";
  ruleText: string;
  priority: number;
  scope: "system" | "team" | "workspace" | "user";
}

/**
 * Category display configuration for policy rules.
 */
const POLICY_CATEGORY_CONFIG: Record<
  PolicyRuleForInstructions["category"],
  { label: string; order: number }
> = {
  git_policy: { label: "Git Policy", order: 1 },
  security: { label: "Security", order: 2 },
  workflow: { label: "Workflow", order: 3 },
  tool_restriction: { label: "Tool Restrictions", order: 4 },
  custom: { label: "Custom", order: 5 },
};

/**
 * Generate markdown instructions from centralized policy rules.
 * Groups rules by category and renders them in a consistent format.
 *
 * @param policyRules - Array of policy rules fetched from Convex
 * @returns Markdown string to inject into agent instruction files
 */
export function getPolicyRulesInstructions(
  policyRules: PolicyRuleForInstructions[],
): string {
  if (!policyRules || policyRules.length === 0) {
    return "";
  }

  // Group rules by category
  const byCategory = new Map<PolicyRuleForInstructions["category"], PolicyRuleForInstructions[]>();
  for (const rule of policyRules) {
    const existing = byCategory.get(rule.category) ?? [];
    existing.push(rule);
    byCategory.set(rule.category, existing);
  }

  // Sort rules within each category by priority
  for (const rules of byCategory.values()) {
    rules.sort((a, b) => a.priority - b.priority);
  }

  // Build markdown output
  let output = "# Agent Policy Rules\n\n";
  output +=
    "> These rules are centrally managed by cmux and override repo-level rules.\n";
  output += "> Last updated at spawn time. Use refresh_policy_rules MCP tool to fetch latest.\n\n";

  // Render categories in order
  const sortedCategories = Array.from(byCategory.keys()).sort(
    (a, b) => POLICY_CATEGORY_CONFIG[a].order - POLICY_CATEGORY_CONFIG[b].order,
  );

  for (const category of sortedCategories) {
    const rules = byCategory.get(category);
    if (!rules || rules.length === 0) continue;

    const { label } = POLICY_CATEGORY_CONFIG[category];
    output += `## ${label}\n\n`;

    for (const rule of rules) {
      // Add rule text directly (it's already markdown)
      output += `${rule.ruleText}\n\n`;
    }
  }

  return output;
}

/**
 * Orchestration rule for injection into agent instructions.
 * Fetched from agentOrchestrationRules table in Convex.
 */
export interface OrchestrationRuleForInstructions {
  ruleId: string;
  text: string;
  lane: "hot" | "orchestration" | "project";
  confidence: number;
  projectFullName?: string;
}

const LANE_DISPLAY: Record<OrchestrationRuleForInstructions["lane"], { label: string; order: number }> = {
  hot: { label: "Hot Rules (Always Apply)", order: 1 },
  orchestration: { label: "Orchestration Rules", order: 2 },
  project: { label: "Project Rules", order: 3 },
};

/**
 * Generate markdown instructions from orchestration rules.
 * Groups rules by lane and renders them for injection into agent instruction files.
 */
export function getOrchestrationRulesInstructions(
  rules: OrchestrationRuleForInstructions[],
): string {
  if (!rules || rules.length === 0) {
    return "";
  }

  const byLane = new Map<OrchestrationRuleForInstructions["lane"], OrchestrationRuleForInstructions[]>();
  for (const rule of rules) {
    const existing = byLane.get(rule.lane) ?? [];
    existing.push(rule);
    byLane.set(rule.lane, existing);
  }

  // Sort by confidence descending within each lane
  for (const laneRules of byLane.values()) {
    laneRules.sort((a, b) => b.confidence - a.confidence);
  }

  let output = "# Orchestration Rules (Team-Learned)\n\n";
  output += "> These rules were learned from previous orchestration runs and confirmed by team leads.\n\n";

  const sortedLanes = Array.from(byLane.keys()).sort(
    (a, b) => LANE_DISPLAY[a].order - LANE_DISPLAY[b].order,
  );

  for (const lane of sortedLanes) {
    const laneRules = byLane.get(lane);
    if (!laneRules || laneRules.length === 0) continue;

    const { label } = LANE_DISPLAY[lane];
    output += `## ${label}\n\n`;

    for (const rule of laneRules) {
      // Indent continuation lines for multi-line text to preserve markdown list formatting
      const indentedText = rule.text.replace(/\n/g, "\n  ");
      output += `- ${indentedText}\n`;
    }
    output += "\n";
  }

  return output;
}
