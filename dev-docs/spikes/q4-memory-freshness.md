# Q4 Phase 3: Memory Freshness

## Background

Codex CLI 0.106-0.112 introduced mature memory curation:
- Diff-based forgetting
- Usage-aware selection
- Stale/polluted-fact guardrails
- Workspace-scoped writes

cmux's `devsh-memory-mcp` lacks these features.

## Current State

**devsh-memory-mcp v0.3.9:**
- Read/write to MEMORY.md, TASKS.json, MAILBOX.json
- Daily logs
- Orchestration plan/events
- No usage tracking
- No freshness/staleness detection
- No automatic forgetting

## Goal

Add memory freshness features to prevent context bloat and stale facts.

## Design

### 1. Usage Tracking

Add `_meta.usage` to MEMORY.md sections:

```markdown
## P0 Core
<!-- usage: {"lastRead": "2026-03-21T10:00:00Z", "readCount": 15} -->
- [2026-03-15] Uses bun, not npm
```

Track:
- `lastRead`: ISO timestamp of last read
- `readCount`: Total reads
- `lastWrite`: ISO timestamp of last modification

### 2. Freshness Scoring

Score = f(recency, usage, priority)

```typescript
interface FreshnessScore {
  score: number;       // 0-100
  factors: {
    recency: number;   // Days since last update
    usage: number;     // Read frequency
    priority: number;  // P0=100, P1=50, P2=25
  };
  recommendation: "keep" | "review" | "archive";
}
```

### 3. Forgetting Tool

New MCP tool: `forget_stale_memories`

```typescript
{
  name: "forget_stale_memories",
  description: "Archive or remove stale memory entries",
  inputSchema: {
    type: "object",
    properties: {
      dryRun: { type: "boolean", default: true },
      threshold: { type: "number", default: 30 }, // days
      minUsage: { type: "number", default: 2 },   // min reads to keep
    }
  }
}
```

### 4. Guardrails

Prevent bad memory writes:
- Reject entries that contradict existing P0 facts
- Warn on duplicate entries
- Validate date format
- Limit entry length

## Implementation

### Phase 3a: Usage Tracking (2 days)
- [x] Add usage metadata to read_memory
- [x] Track lastRead, readCount on each access
- [x] Persist to _meta section in MEMORY.md

### Phase 3b: Freshness Scoring (2 days)
- [x] Implement scoring algorithm
- [x] Add `get_memory_health` tool
- [x] Return recommendations

### Phase 3c: Forgetting (1 day)
- [x] Implement `forget_stale_memories` tool
- [x] Move to archive section instead of delete
- [x] Support dry-run mode

### Phase 3d: Guardrails (1 day)
- [x] Add validation to update_knowledge
- [x] Duplicate detection
- [x] Contradiction warnings

## Files to Modify

- `packages/devsh-memory-mcp/src/index.ts` - Core implementation
- `packages/shared/src/agent-memory-protocol.ts` - Types

## Status

- [x] Phase 3a: Usage tracking (commit 499661720)
- [x] Phase 3b: Freshness scoring (commit ff501232a)
- [x] Phase 3c: Forgetting tool (commit 30e811a7a)
- [x] Phase 3d: Guardrails (commit 9a36faae5)
