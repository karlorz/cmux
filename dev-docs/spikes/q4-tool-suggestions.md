# Q4 Phase 4: Tool Suggestions

## Background

Codex CLI introduced `tool_suggest` for AI-powered MCP tool recommendations. cmux can surface tool suggestions in the dashboard before spawn.

## Goal

Analyze task prompts and suggest relevant MCP tools to enable.

## Design

### 1. Tool Registry

Store available MCP tools in Convex:

```typescript
// packages/convex/convex/schema.ts
mcpTools: defineTable({
  name: v.string(),                    // "context7", "devsh-memory-mcp"
  displayName: v.string(),             // "Context7 Docs"
  description: v.string(),             // "Fetch library documentation"
  keywords: v.array(v.string()),       // ["docs", "api", "library"]
  category: v.string(),                // "documentation", "memory", "code"
  defaultEnabled: v.boolean(),         // Auto-enable for all tasks
}).index("by_category", ["category"]),
```

### 2. Suggestion Algorithm

Match prompt keywords to tool keywords:

```typescript
function suggestTools(prompt: string, availableTools: McpTool[]): ScoredTool[] {
  const promptTokens = tokenize(prompt.toLowerCase());
  return availableTools
    .map(tool => ({
      tool,
      score: calculateKeywordOverlap(promptTokens, tool.keywords),
    }))
    .filter(t => t.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
```

### 3. UI Integration

Add suggestions chip below prompt input:

```tsx
// DashboardInputControls.tsx
{suggestedTools.length > 0 && (
  <div className="flex gap-2 mt-2">
    <span className="text-xs text-muted-foreground">Suggested tools:</span>
    {suggestedTools.map(tool => (
      <Badge
        key={tool.name}
        variant="outline"
        className="cursor-pointer"
        onClick={() => enableTool(tool.name)}
      >
        {tool.displayName}
      </Badge>
    ))}
  </div>
)}
```

## Implementation

### Phase 4a: Tool Registry (1 day)
- [ ] Add mcpTools table to Convex schema
- [ ] Seed initial tools (context7, devsh-memory-mcp)
- [ ] Add query to fetch available tools

### Phase 4b: Suggestion Logic (1 day)
- [ ] Implement keyword-based matching
- [ ] Add Convex action for suggestions
- [ ] Debounce on prompt change

### Phase 4c: UI Integration (2 days)
- [ ] Add suggested tools display
- [ ] Enable/disable tool toggles
- [ ] Persist tool preferences per project

### Phase 4d: AI Enhancement (Optional)
- [ ] Use Claude to analyze prompt intent
- [ ] Semantic similarity matching
- [ ] Learn from user selections

## Files to Modify

- `packages/convex/convex/schema.ts` - Add mcpTools table
- `packages/convex/convex/mcpTools.ts` - NEW: Tool queries/mutations
- `apps/client/src/components/dashboard/DashboardInputControls.tsx` - UI
- `apps/client/src/hooks/useToolSuggestions.ts` - NEW: Suggestion hook

## Status

- [x] Phase 4a: Tool registry (commit d9190e861)
- [x] Phase 4b: Suggestion logic (commit d655fac76)
- [x] Phase 4c: UI integration (commit 757c20397)
- [ ] Phase 4d: AI enhancement (optional)
