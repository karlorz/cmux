# Q4 Phase 5: Context Window Optimization

## Background

Claude Opus 4.6 supports 1M context window. cmux should leverage this for longer sessions and display context usage to users.

## Goal

1. Track context window metadata per model
2. Display context usage in dashboard
3. (Future) Implement pre-compact hooks

## Design

### 1. Context Window Metadata

Added to `AgentCatalogEntry`:

```typescript
interface AgentCatalogEntry {
  // ...existing fields
  contextWindow?: number;    // Max input tokens
  maxOutputTokens?: number;  // Max output tokens
}
```

### 2. Context Usage Display

Show model context capacity in agent selector tooltip:

```
Opus 4.6 - 1M context, 32K output
```

### 3. Future: Pre-Compact Hooks

When context nears limit, trigger compact/summarize:
- Monitor token usage via activity stream
- Auto-summarize at 80% threshold
- Preserve critical context (files, errors)

## Implementation

### Phase 5a: Metadata (Done)
- [x] Add contextWindow, maxOutputTokens to AgentCatalogEntry
- [x] Populate for Claude models (Opus 4.6 = 1M)
- [x] Populate for flagship OpenAI models

### Phase 5b: Display (Optional)
- [ ] Show context capacity in agent selector
- [ ] Add tooltip with model capabilities

### Phase 5c: Pre-Compact (Future)
- [ ] Monitor context usage
- [ ] Implement summarization triggers
- [ ] Add user preferences

## Status

- [x] Phase 5a: Metadata (commit pending)
- [ ] Phase 5b: Display (optional)
- [ ] Phase 5c: Pre-Compact (future)
