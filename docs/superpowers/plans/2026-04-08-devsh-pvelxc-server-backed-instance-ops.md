# Devsh PVE-LXC Server-Backed Instance Ops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make production-style `devsh` fully usable for `pve-lxc` instances without local `PVE_API_URL` and `PVE_API_TOKEN`, not just `start` and `ls`.

**Architecture:** Keep two execution paths for `pve-lxc`: direct local PVE access when `PVE_*` env is present, and authenticated server-backed access through `apps/www` when it is not. Reuse the existing server-managed model introduced for `devsh start` and `devsh ls`, add missing per-instance routes with ownership checks, then point the CLI commands at those routes.

**Tech Stack:** Go CLI (`packages/devsh`), Hono routes (`apps/www`), Convex activity tracking (`packages/convex`), Vitest/Bun, production smoke checks with `make install-devsh-prod`

---

## Root Cause

- `devsh start .` now resolves to server-managed `pve-lxc` correctly when no local provider env is present.
- `devsh ls` also works because it already calls `ListPveLxcInstances()` through `apps/www`.
- `devsh status`, `exec`, `code`, `vnc`, `pause`, `resume`, and `delete` still infer `pve-lxc` from the instance ID and then immediately call `pvelxc.NewClientFromEnv()`.
- That means the CLI is only partially migrated to server-managed PVE and fails in production-style shells where provider secrets are intentionally not local.

## Files

**Modify:**
- `apps/www/lib/routes/pve-lxc.instances.route.ts`
- `apps/www/lib/routes/pve-lxc.route.ts`
- `apps/www/lib/routes/pve-lxc.route.test.ts`
- `packages/devsh/internal/vm/client.go`
- `packages/devsh/internal/vm/client_test.go`
- `packages/devsh/internal/cli/exec_simple.go`
- `packages/devsh/internal/cli/open.go`
- `packages/devsh/internal/cli/pause.go`
- `packages/devsh/internal/cli/resume.go`
- `packages/devsh/internal/cli/delete.go`

**Possibly add if needed for clarity or reuse:**
- `packages/devsh/internal/cli/pvelxc_server_ops.go`
- `apps/www/lib/routes/pve-lxc.instances.helpers.ts`

## Task 1: Lock the Regression with Failing Tests

**Files:**
- Modify: `packages/devsh/internal/vm/client_test.go`
- Modify: `apps/www/lib/routes/pve-lxc.route.test.ts`

- [ ] **Step 1: Add Go client tests for the missing server-backed PVE instance operations**

Add tests that expect authenticated `apps/www` calls for these methods:
- `GetPveLxcInstance`
- `ExecPveLxcInstance`
- `PausePveLxcInstance`
- `ResumePveLxcInstance`
- `StopPveLxcInstance`

Each test should verify:
- the route path starts with `/api/pve-lxc/instances/...`
- `teamSlugOrId=example-team` is sent where required
- the `Authorization` header uses the cached access token
- the response body is decoded into the expected Go shape

- [ ] **Step 2: Run the Go test target and confirm the new tests fail before implementation**

Run:

```bash
cd packages/devsh && go test ./internal/vm -run 'Test(Get|Exec|Pause|Resume|Stop)PveLxc' -count=1
```

Expected:
- compile failure or missing-method failure before implementation

- [ ] **Step 3: Add route-level coverage for authenticated PVE instance operations**

Extend `apps/www/lib/routes/pve-lxc.route.test.ts` to cover:
- `GET /api/pve-lxc/instances/:instanceId`
- `POST /api/pve-lxc/instances/:instanceId/exec`
- `POST /api/pve-lxc/instances/:instanceId/pause`
- `POST /api/pve-lxc/instances/:instanceId/resume`
- `POST /api/pve-lxc/instances/:instanceId/stop`

The tests do not need live PVE. They should assert acceptable auth/config failure modes and keep these routes visible to CI.

- [ ] **Step 4: Run the focused Vitest file and confirm red or missing coverage before implementation**

Run:

```bash
bun run test apps/www/lib/routes/pve-lxc.route.test.ts
```

Expected:
- missing client helpers or route failures until the endpoints exist

## Task 2: Add the Missing Server-Backed PVE Instance Routes

**Files:**
- Modify: `apps/www/lib/routes/pve-lxc.instances.route.ts`
- Modify: `apps/www/lib/routes/pve-lxc.route.ts`

- [ ] **Step 1: Add shared request and response schemas**

Define schemas for:
- `teamSlugOrId`
- per-instance status payload
- exec request/response
- boolean action responses for pause/resume/stop

Return a stable instance shape:
- `id`
- `status`
- `vscodeUrl`
- `vncUrl`
- `xtermUrl`

- [ ] **Step 2: Enforce authenticated team-scoped ownership checks for each route**

Use:
- `getAccessTokenFromRequest`
- `verifyTeamAccess`
- `getConvex({ accessToken })`
- `api.sandboxInstances.getActivity`

Authorization rule:
- require an activity record for the instance
- require `activity.teamId` to match the verified team UUID when present
- reject missing or mismatched ownership with `404` or `403`

- [ ] **Step 3: Implement instance detail and action routes**

Add:
- `GET /pve-lxc/instances/{instanceId}`
- `POST /pve-lxc/instances/{instanceId}/exec`
- `POST /pve-lxc/instances/{instanceId}/pause`
- `POST /pve-lxc/instances/{instanceId}/resume`
- `POST /pve-lxc/instances/{instanceId}/stop`

Behavior:
- use `getPveLxcClient().instances.get({ instanceId })`
- map service URLs from `networking.httpServices`
- `exec` should return `stdout`, `stderr`, and `exit_code`
- `resume` should call `waitForPveExecReady(instance)` before returning
- `pause` should record pause activity
- `stop` should record stop activity

- [ ] **Step 4: Keep route registration centralized under the existing PVE router**

Do not create a parallel router tree. Extend the existing `pveLxcInstancesRouter` and keep `pve-lxc.route.ts` as the single route aggregator.

## Task 3: Extend the Go VM Client for Server-Backed PVE Operations

**Files:**
- Modify: `packages/devsh/internal/vm/client.go`
- Modify: `packages/devsh/internal/vm/client_test.go`

- [ ] **Step 1: Add typed helpers on `vm.Client` for server-backed PVE instance operations**

Add methods:
- `GetPveLxcInstance(ctx, instanceID string) (*Instance, error)`
- `ExecPveLxcInstance(ctx, instanceID, command string, timeoutSeconds int) (string, string, int, error)`
- `PausePveLxcInstance(ctx, instanceID string) error`
- `ResumePveLxcInstance(ctx, instanceID string) (*Instance, error)`
- `StopPveLxcInstance(ctx, instanceID string) error`

Implementation rule:
- use `doWwwRequest`
- require `c.teamSlug`
- use `/api/pve-lxc/instances/...` endpoints

- [ ] **Step 2: Reuse the same instance JSON shape used by `ListPveLxcInstances`**

Avoid introducing a second struct unless the route payload truly differs. The CLI already knows how to print `vm.Instance`.

- [ ] **Step 3: Run the focused Go tests and get them green**

Run:

```bash
cd packages/devsh && go test ./internal/vm -run 'Test(Get|Exec|Pause|Resume|Stop)PveLxc|TestListPveLxcInstancesUsesWwwRoute' -count=1
```

Expected:
- all new and existing PVE www-client tests pass

## Task 4: Update CLI Commands to Use the Server-Backed Fallback

**Files:**
- Modify: `packages/devsh/internal/cli/exec_simple.go`
- Modify: `packages/devsh/internal/cli/open.go`
- Modify: `packages/devsh/internal/cli/pause.go`
- Modify: `packages/devsh/internal/cli/resume.go`
- Modify: `packages/devsh/internal/cli/delete.go`
- Possibly add: `packages/devsh/internal/cli/pvelxc_server_ops.go`

- [ ] **Step 1: Introduce one shared decision point for PVE instance operations**

Rule:
- if provider is not `pve-lxc`, keep existing provider-specific behavior
- if provider is `pve-lxc` and `provider.HasPveEnv()` is true, keep direct local PVE behavior
- if provider is `pve-lxc` and `provider.HasPveEnv()` is false, use the new `vm.Client` server-backed methods

- [ ] **Step 2: Switch `status`, `code`, and `vnc` to use the server-backed instance detail call**

Use the returned URLs exactly as printed today.

- [ ] **Step 3: Switch `exec`, `pause`, `resume`, and `delete` to the server-backed methods**

Preserve current UX:
- same command names
- same printed success lines
- same non-zero exit handling for `exec`

- [ ] **Step 4: Keep the local-direct path unchanged for devs who intentionally export `PVE_*`**

This avoids breaking existing direct Proxmox admin workflows.

## Task 5: Verify the Full Flow and Close the Coverage Gap

**Files:**
- Modify: `apps/www/lib/routes/pve-lxc.route.test.ts`
- Modify: `packages/devsh/internal/vm/client_test.go`

- [ ] **Step 1: Run the focused test suite for the touched areas**

Run:

```bash
bun run test apps/www/lib/routes/pve-lxc.route.test.ts
cd packages/devsh && go test ./internal/vm ./internal/cli -count=1
```

Expected:
- route tests pass
- vm tests pass
- cli package remains green

- [ ] **Step 2: Build the production CLI and verify prod-style behavior locally**

Run:

```bash
make install-devsh-prod
tmpdir="$(mktemp -d /tmp/devsh-prod-full.XXXXXX)"
cd "$tmpdir"
env -u PVE_API_URL -u PVE_API_TOKEN -u E2B_API_KEY -u SANDBOX_PROVIDER ~/.local/bin/devsh start . --verbose
env -u PVE_API_URL -u PVE_API_TOKEN -u E2B_API_KEY -u SANDBOX_PROVIDER ~/.local/bin/devsh ls
env -u PVE_API_URL -u PVE_API_TOKEN -u E2B_API_KEY -u SANDBOX_PROVIDER ~/.local/bin/devsh status <instance-id>
env -u PVE_API_URL -u PVE_API_TOKEN -u E2B_API_KEY -u SANDBOX_PROVIDER ~/.local/bin/devsh exec <instance-id> \"gh auth status\"
env -u PVE_API_URL -u PVE_API_TOKEN -u E2B_API_KEY -u SANDBOX_PROVIDER ~/.local/bin/devsh delete <instance-id>
```

Expected:
- `start` creates a `pvelxc-*` instance
- `ls` shows it
- `status` prints URLs
- `exec` reaches the sandbox instead of failing on missing local PVE env
- `delete` succeeds

- [ ] **Step 3: Explain and close the test/CI gap in the final summary**

The miss happened because current coverage only locked:
- provider resolution for `start`
- server-backed `ls`

Missing coverage to add and mention:
- no Go tests for server-backed per-instance PVE operations
- no CLI regression around `pvelxc-*` commands with missing local env
- no prod-style smoke test asserting `start -> status/exec/delete` in a clean shell

- [ ] **Step 4: Commit on the feature branch**

Run:

```bash
git add apps/www/lib/routes/pve-lxc.instances.route.ts apps/www/lib/routes/pve-lxc.route.ts apps/www/lib/routes/pve-lxc.route.test.ts packages/devsh/internal/vm/client.go packages/devsh/internal/vm/client_test.go packages/devsh/internal/cli/exec_simple.go packages/devsh/internal/cli/open.go packages/devsh/internal/cli/pause.go packages/devsh/internal/cli/resume.go packages/devsh/internal/cli/delete.go docs/superpowers/plans/2026-04-08-devsh-pvelxc-server-backed-instance-ops.md
git commit -m "fix: route pve-lxc instance ops through server fallback"
```

Expected:
- pre-commit runs `bun check`
- commit succeeds without bypassing hooks

## Why This Plan Fixes the Reported Production Problem

- The binary only bakes control-plane URLs, not Proxmox secrets.
- Therefore, production `devsh` must not require local `PVE_*` for normal user-facing sandbox operations.
- After this change, all ordinary `pvelxc-*` lifecycle and access commands will use the same server-managed ownership and provider configuration model as `start` and `ls`.
