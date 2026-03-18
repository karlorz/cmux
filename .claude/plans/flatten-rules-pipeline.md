# Flatten Rules Pipeline Plan

## Goal
Simplify the orchestration rules pipeline from 15-cell state matrix (5 statuses × 3 lanes) to 6-cell (3 statuses × 2 active lanes).

## Current State
- **Statuses**: candidate, active, suppressed, archived (4 + implicit "forgotten")
- **Lanes**: hot, orchestration, project (3)
- **Files affected**: ~5 Convex files, ~4 UI files

## Target State
- **Statuses**: candidate, active, dismissed (3)
- **Lanes**: hot, orchestration (2 active injection lanes), project (for filtering only)
- **Simplified UI**: 2 tabs (Active Rules, Candidates) instead of 3

## Changes Required

### Phase 1: Backend (Convex)

1. **Schema update** (`packages/convex/convex/schema.ts`)
   - Change status validator from 4 to 3 values
   - Mark "suppressed" and "archived" as deprecated synonyms for "dismissed"

2. **Mutation updates** (`packages/convex/convex/agentOrchestrationLearning.ts`)
   - Replace `suppressRule` with `dismissRule` (same behavior)
   - Remove or deprecate archiving logic
   - Update status validator

3. **Query updates** (`packages/convex/convex/orchestrationQueries.ts`)
   - Ensure queries handle both old and new status values during transition

### Phase 2: Frontend (React)

1. **Type updates** (`apps/client/src/components/settings/sections/useOrchestrationRules.ts`)
   - Update RuleStatus type to: `"candidate" | "active" | "dismissed"`

2. **Style updates** (`apps/client/src/components/settings/sections/orchestration-rules-styles.ts`)
   - Update status badge colors for new simplified statuses

3. **UI simplification** (`apps/client/src/components/settings/sections/OrchestrationRulesSection.tsx`)
   - Simplify tabs if needed

### Phase 3: Migration

1. **Data migration** (one-time Convex mutation)
   - Map "suppressed" → "dismissed"
   - Map "archived" → "dismissed"

## Risks
- Breaking change for existing rules with suppressed/archived status
- Need backwards compatibility period

## Decision
Keep this as a TODO for now. The current system works and changing it requires:
1. Coordinated schema + code + migration
2. Testing with production data
3. User communication about status changes

**Recommendation**: Defer to next major version or when rules UI gets more usage.
