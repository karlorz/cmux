# Bug Fix: [Bug Title]

## Problem

Description of the bug and its symptoms.

**Reproduction steps:**
1. Step 1
2. Step 2
3. Bug occurs

## Root Cause

Analysis of why the bug occurs.

**Location:** `path/to/file.ts:line`

## Solution

### Fix

**File:** `path/to/file.ts`

**Before:**
```typescript
// Buggy code
```

**After:**
```typescript
// Fixed code
```

### Additional Changes

List any related changes needed.

## Verification

1. Run `bun check`
2. Run tests: `bun test path/to/test.test.ts`
3. Verify fix:
   - [ ] Bug no longer reproduces
   - [ ] No regressions introduced

## Test Plan

- Add test case covering the bug scenario
- Verify existing tests still pass
