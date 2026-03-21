# Dev Direction: cmux Q3 2026

## Vision

Q3 focuses on **web app polish and production readiness** - completing the UI gaps identified in Q2, improving mobile experience, and unblocking deployment.

## Current State (2026-03-21)

### Q3 Completed (All UI Phases)
- Phase 0.5: Live Diff & Test Results panels (PR #728)
- Phase 1: Task checkbox & pin button enabled
- Phase 2: Mobile hamburger navigation added
- Phase 3: Skeleton imports centralized (PR #730)
- Phase 4: Vault integration complete (routes + RecommendedActions)
- Phase 5: Activity stream has filtering/search/export
- Phase 6: Cloud onboarding + provider health indicators

### Remaining
- Phase 7: Coolify Migration - **COMPLETE** (workflows exist for client, www, server)

### Original Identified Gaps (all resolved except infra)

**High Priority:** (DONE)
1. ~~Task checkbox & pin button hidden~~ - Enabled
2. ~~No mobile hamburger navigation~~ - Added
3. ~~No skeleton loaders for dashboard components~~ - Centralized
4. ~~Vault integration incomplete~~ - Full implementation

**Medium Priority:** (DONE)
5. ~~Activity stream missing filtering/search/export~~ - Implemented
6. ~~Cloud onboarding banner commented out~~ - Enabled
7. ~~Provider status not integrated~~ - ProviderHealthCard exists
8. ~~No component-level error boundaries~~ - ErrorBoundary.tsx exists

**Infrastructure:** (DONE)
9. ~~Vercel deployment cap (Coolify migration)~~ - Coolify workflows deployed

---

## Q3 Phases

### Phase 1: Task UX Polish (Week 1)
Enable hidden task functionality and improve task management.

**Changes:**
1. Enable task checkbox in TaskItem.tsx (line 312)
2. Enable pin button in TaskItem.tsx (line 569)
3. Add bulk actions toolbar (select all, bulk delete, bulk pin)
4. Add keyboard shortcuts for task navigation

**Files:**
- `apps/client/src/components/dashboard/TaskItem.tsx`
- `apps/client/src/components/dashboard/TaskList.tsx`

**Effort:** 2-3 days

---

### Phase 2: Mobile Navigation (Week 1-2)
Add hamburger menu for mobile devices.

**Changes:**
1. Add hamburger icon in TitleBar for mobile breakpoints
2. Create slide-out drawer for sidebar on mobile
3. Add touch gestures for drawer open/close
4. Ensure all nav items accessible on mobile

**Files:**
- `apps/client/src/components/TitleBar.tsx`
- `apps/client/src/components/Sidebar.tsx`
- New: `apps/client/src/components/MobileDrawer.tsx`

**Effort:** 3-4 days

---

### Phase 3: Loading & Error States (Week 2)
Add skeleton loaders and error boundaries.

**Changes:**
1. Create skeleton components for:
   - SessionActivityCard
   - FileChangeHeatmap
   - SessionTimeline
   - ActivityStream
2. Add error boundaries with fallback UI for dashboard sections
3. Add loading spinner to ActivityStream

**Files:**
- `apps/client/src/components/dashboard/`
- `apps/client/src/components/ActivityStream.tsx`
- New: `apps/client/src/components/skeletons/`
- New: `apps/client/src/components/ErrorBoundary.tsx`

**Effort:** 3-4 days

---

### Phase 4: Vault Integration (Week 3)
Complete Obsidian vault integration.

**Changes:**
1. Implement user config fetch in vault.route.ts (line 117)
2. Wire RecommendedActions to vault API
3. Add vault config UI in settings
4. Test with real Obsidian vaults

**Files:**
- `apps/www/lib/routes/vault.route.ts`
- `apps/client/src/components/projects/RecommendedActions.tsx`
- `apps/client/src/routes/_layout.$teamSlugOrId.settings.tsx`

**Effort:** 1 week

---

### Phase 5: Activity Stream Enhancements (Week 3-4)
Add filtering, search, and export.

**Changes:**
1. Add filter bar (by event type, time range)
2. Add search input for activity content
3. Add export button (JSON, CSV)
4. Improve loading indicator (spinner instead of text)

**Files:**
- `apps/client/src/components/ActivityStream.tsx`
- `apps/client/src/routes/_layout.$teamSlugOrId.task.$taskId.run.$runId.activity.tsx`

**Effort:** 3-4 days

---

### Phase 6: Cloud Onboarding & Provider Status (Week 4)
Enable commented-out features.

**Changes:**
1. Enable cloud repo onboarding banner
2. Integrate provider status into agent selection dropdown
3. Show provider health indicators in dashboard

**Files:**
- `apps/client/src/routes/_layout.$teamSlugOrId.dashboard.tsx`
- `apps/client/src/components/dashboard/DashboardInputControls.tsx`

**Effort:** 2-3 days

---

### Phase 7: Coolify Migration (Ongoing)
Infrastructure task - move apps/client and apps/www to Coolify.

**Changes:**
1. Configure Coolify stack for apps/client (Vite SPA)
2. Remove hono/vercel adapter from apps/www
3. Deploy to Coolify
4. Update DNS and monitoring

**Effort:** 1-2 weeks (infrastructure)

---

## Priority Matrix

| Phase | Feature | User Impact | Effort | Dependencies |
|-------|---------|-------------|--------|--------------|
| 1 | Task UX Polish | High | 2-3 days | None |
| 2 | Mobile Navigation | High | 3-4 days | None |
| 3 | Loading & Error States | Medium | 3-4 days | None |
| 4 | Vault Integration | Medium | 1 week | None |
| 5 | Activity Stream | Medium | 3-4 days | None |
| 6 | Cloud Onboarding | Low | 2-3 days | None |
| 7 | Coolify Migration | High | 1-2 weeks | Infrastructure access |

## Success Metrics

- **Phase 1**: Users can select/pin tasks from dashboard
- **Phase 2**: Mobile users can navigate without horizontal scrolling
- **Phase 3**: No loading flash, graceful error recovery
- **Phase 4**: Obsidian recommendations appear in project view
- **Phase 5**: Users can filter activity by type and export logs
- **Phase 6**: New users see onboarding guidance
- **Phase 7**: Deploy frequency unblocked from Vercel cap
