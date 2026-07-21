# Cloud workspace start modes

> **Last updated:** 2026-07-22  
> **Primary UI entry:** Team dashboard (`/$teamSlugOrId/dashboard`)  
> **Not the entry:** preview.new `/preview` (PR screenshot product)

Operators can start cloud workspaces in three modes: **Default**, **Clean**, and **Mirror local**. Modes exist on both the **team dashboard** (app) and the **devsh CLI**. Dashboard and CLI share backend semantics where applicable; full host filesystem pack for mirror is CLI/Electron-only.

## Primary product path (dashboard)

1. Open the **team dashboard** in the desktop app (Electron) or web client.
2. Select an **environment** (cloud create still requires an environment — not a bare repo).
3. Choose **Start mode**: Default | Clean | Mirror local.
4. Click **Create Cloud Workspace**.

| Mode | Behavior |
|------|----------|
| **Default** | Existing start: setup-providers auth injection runs as today. |
| **Clean** | Ownership / team sandbox linkage still recorded; **setup-providers auth injection skipped** (`clean: true` on `POST /api/sandboxes/start`). |
| **Mirror local** | Implies clean for auth. **Enabled only in Electron.** Packs redacted local agent config (`~/.claude` / `~/.codex` allowlist) via host path when available; otherwise soft-fails with clear toast + CLI guidance. Disabled in pure browser with tooltip. |

### Wiring (implementation)

- UI: `apps/client/src/components/dashboard/WorkspaceCreationButtons.tsx`
- Socket/HTTP: `create-cloud-workspace` accepts `clean` / `mirrorLocal` (`packages/shared` schema)
- Server forwards `clean` into sandboxes start; start route skips setup-providers when mode is clean/mirror-local
- Shared helpers: `@cmux/shared` `workspace-start-mode`

### What is not the entry

- `http://localhost:9779/preview` — **Screenshot previews for GitHub PRs** (preview.new), not team cloud create.
- Bare `/preview/configure` without `?repo=` — 404 by design.

## CLI path (authoritative for host pack)

```bash
# Default
devsh start -p pve-lxc

# Clean: skip provider auth injection; keep ownership
devsh start -p pve-lxc --clean

# Mirror local: clean + pack redacted host agent config into the box
devsh start -p pve-lxc --clean --mirror-local

# Templates (CLI-only in v1 — no dashboard picker)
devsh start -p pve-lxc --template <name>
# Recipes: ~/.cmux/templates/*.yaml
```

Prefer **pve-lxc** for mirror-local. Morph/E2B: mirror unsupported; use Clean if applicable or CLI docs for provider limits.

## Limits and known soft-fails

| Topic | Status |
|-------|--------|
| Environment required on dashboard cloud create | Yes |
| Template picker in dashboard | No (CLI only) |
| Browser pack of `~/.claude` | No (Electron/host only) |
| Dashboard mirror host pack | Soft-fail + `devsh … --mirror-local` guidance if pack not fully attached to dashboard sandboxes |
| Secrets / OAuth copy | Off by default (redacted allowlist) |
| Auto-merge of feature PR | **No** — human approval (`merge_auto_approved: false`) |

## Research notes (2026-07-22)

Supporting research used **grok-search** as the primary web tool:

- Clean LXC workspaces should avoid baking credentials into templates; apply non-secret config after start.
- Selective agent-config mirror beats full home sync for security and reproducibility.
- Dashboard vs CLI should document **semantic parity**, with CLI preferred for automation and durable host pack.

Vault: `projects/cmux/requirements/2026-07-22-deep-research-cloud-workspace-start-modes-dashboard.md`

## Related PRs

- Dashboard start modes: PR #1272 (`feat/cloud-workspace-start-modes-dashboard`) — **leave merge for human approval**
- Preview-surface experiment: PR #1271 — not the dashboard product entry
