/**
 * Orchestration Routes (Legacy Re-export)
 *
 * This file re-exports from the split orchestrate/ directory for backwards compatibility.
 * The orchestration routes have been split into:
 * - orchestrate/tasks.route.ts - Core task management
 * - orchestrate/sync.route.ts - Head agent sync
 * - orchestrate/sessions.route.ts - Provider session binding
 * - orchestrate/events.route.ts - SSE real-time updates
 * - orchestrate/approvals.route.ts - Human-in-the-loop approvals
 * - orchestrate/learning.route.ts - Self-improving rules
 */

export { orchestrateRouter } from "./orchestrate/index";
