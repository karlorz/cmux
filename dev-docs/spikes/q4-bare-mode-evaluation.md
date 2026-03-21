# Q4 Phase 1: Claude `--bare` Mode Evaluation

## Background

Claude Code v2.1.78 introduced `--bare` flag for scripted `-p` calls:
- Skips hooks, LSP, plugin sync, and skill directory walks
- Requires `ANTHROPIC_API_KEY` or `apiKeyHelper` via `--settings`
- OAuth and keychain auth disabled; auto-memory fully disabled

## Hypothesis

`--bare` mode could reduce agent spawn latency by 30%+ compared to full CLI or SDK spawning.

## Current Spawn Methods

| Method | File | Startup Cost | Features |
|--------|------|--------------|----------|
| PTY-based | `agentSpawner.ts` | High | tmux, VSCode, full CLI |
| SDK-based | `agentSpawnerSDK.ts` | Medium | Hooks, streaming, no VSCode |
| `--bare` (proposed) | N/A | Low | Minimal, no hooks |

## Test Plan

### 1. Benchmark Setup (in sandbox)

```bash
# Full CLI spawn
time claude -p "echo hello" --print

# Bare mode spawn
time claude --bare -p "echo hello" --print
```

### 2. Metrics to Capture

- Time to first token (TTFT)
- Total execution time
- Memory usage
- Feature availability (hooks, MCP, memory)

### 3. Tradeoffs

**Loses with `--bare`:**
- Hooks (PreToolUse, PostToolUse) - needed for activity stream
- LSP integration
- Plugin sync
- Skill directory walks
- OAuth/keychain auth
- Auto-memory

**Keeps with `--bare`:**
- Core tool execution
- Model inference
- Basic file operations

## Recommendation

Use `--bare` for:
- Simple, one-shot tasks
- Validation runs
- Quick fixes

Keep SDK/PTY for:
- Complex orchestration
- Tasks needing activity observability
- Long-running sessions

## Implementation

If beneficial, add `--bare` option to spawn config:

```typescript
interface SpawnConfig {
  // ...existing fields
  bareMode?: boolean; // Use --bare for lightweight spawns
}
```

## Status

- [ ] Benchmark in sandbox environment
- [ ] Document latency improvements
- [ ] Implement spawn option if >20% improvement
