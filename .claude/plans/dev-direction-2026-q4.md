# Dev Direction: cmux Q4 2026

## Vision

Q4 focuses on **upstream alignment and performance optimization** - adopting new Claude/Codex features, improving spawn latency, and enhancing memory quality.

## Current State (2026-03-21)

### Q2-Q3 Complete
- All launch pillars shipped
- Native workflow dashboard (Live Diff, Test Results, Activity Stream)
- Mobile navigation, skeleton loaders, error boundaries
- Coolify deployment workflows

### Research Findings (from obsidian sync)
- Claude Code v2.1.78: `--bare` flag, `--channels` approval relay, 1M context
- Codex 0.114+: hooks engine, `tool_suggest`, memory forgetting
- Both CLIs converging on plugin ecosystems

---

## Q4 Phases

### Phase 1: Claude `--bare` Mode Evaluation (Week 1)
Evaluate lighter spawn path for sandbox agents.

**Changes:**
1. Benchmark `--bare` vs SDK spawn latency
2. Document tradeoffs (no hooks, no LSP, no plugin sync)
3. Add `--bare` option to agentSpawner if beneficial

**Files:**
- `packages/shared/src/agentSpawnerSDK.ts`
- `apps/server/lib/routes/sandboxes/spawn.ts`

**Effort:** 2-3 days

---

### Phase 2: Approval Channel Bridge (Week 1-2)
Map Claude's `--channels` approval relay to cmux's approval broker.

**Changes:**
1. Study Claude's channel protocol spec
2. Bridge to existing `ApprovalRequestCard` component
3. Enable mobile approval push via cmux UI

**Files:**
- `apps/client/src/components/ApprovalRequestCard.tsx`
- `packages/convex/convex/approvals.ts`

**Effort:** 3-4 days

---

### Phase 3: Memory Freshness (Week 2-3)
Implement usage-aware memory selection (borrowing from Codex patterns).

**Changes:**
1. Add usage tracking to devsh-memory-mcp
2. Implement diff-based forgetting
3. Add stale-fact guardrails

**Files:**
- `packages/devsh-memory-mcp/src/tools/`
- `packages/shared/src/agent-memory-protocol.ts`

**Effort:** 1 week

---

### Phase 4: Tool Suggestions (Week 3-4)
AI-powered MCP tool recommendations for tasks.

**Changes:**
1. Analyze task prompt to suggest relevant MCP tools
2. Surface suggestions in dashboard before spawn
3. Auto-enable suggested tools

**Files:**
- `apps/client/src/components/dashboard/DashboardInputControls.tsx`
- `packages/convex/convex/toolSuggestions.ts`

**Effort:** 1 week

---

### Phase 5: Context Window Optimization (Week 4)
Leverage 1M context for Opus 4.6.

**Changes:**
1. Update agent config for extended context
2. Add context usage indicators to dashboard
3. Implement pre-compact hooks for context management

**Files:**
- `packages/shared/src/agent-config.ts`
- `apps/client/src/components/dashboard/`

**Effort:** 3-4 days

---

## Priority Matrix

| Phase | Feature | User Impact | Effort | Dependencies |
|-------|---------|-------------|--------|--------------|
| 1 | `--bare` Mode | Medium | 2-3 days | None |
| 2 | Approval Bridge | High | 3-4 days | Phase 1 |
| 3 | Memory Freshness | High | 1 week | None |
| 4 | Tool Suggestions | Medium | 1 week | None |
| 5 | Context Optimization | Medium | 3-4 days | None |

## Success Metrics

- **Phase 1**: 30%+ spawn latency reduction with `--bare`
- **Phase 2**: Mobile approvals work via cmux UI
- **Phase 3**: Memory context bloat reduced by 50%
- **Phase 4**: Tool suggestions shown for 80% of tasks
- **Phase 5**: Extended context available for Opus 4.6 users

## Sources

- Claude Code changelog: v2.1.66-v2.1.78
- Codex CLI changelog: v0.107.0-v0.114.0
- Obsidian: `research-extended-2026-03-21.md`
