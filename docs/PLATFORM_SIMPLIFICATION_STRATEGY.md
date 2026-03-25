# cmux Platform Simplification Strategy

> **Goal**: Reduce complexity, cut costs, and unify CLI/Web experience
> **Status**: Research complete, ready for implementation
> **Last Updated**: 2026-03-23

## Executive Summary

Based on comprehensive Obsidian research, cmux has **all major features implemented** but suffers from:
1. **Surface confusion**: 4+ CLIs competing for operator attention
2. **Provider inconsistency**: Different providers exposed per surface
3. **Cost inefficiency**: Still using expensive Morph when PVE-LXC is ready
4. **Duplicate code**: Instruction assembly repeated across providers

**Target outcomes**:
- 60-80% cost reduction ($500-1000/mo → $100-300/mo)
- One primary CLI (`devsh`) + one visual surface (web app)
- Unified provider capability contract
- Simplified instruction injection

---

## 1. Surface Unification

### Current Problem

```
Operator sees 4 front doors:
├── cmux app (web/electron)
├── devsh CLI
├── cloudrouter CLI
└── cmux Rust CLI
```

### Recommended Product Boundaries

| Surface | Role | Status |
|---------|------|--------|
| **cmux app** | Primary visual operator surface | Keep |
| **devsh** | Primary operator CLI (tasks, orchestration, local captain) | Keep, promote |
| **cloudrouter** | Specialized sandbox/GPU CLI and public skill | Keep, narrow scope |
| **cmux Rust** | Backend runtime tooling | Demote from user-facing |

### Implementation

1. **Documentation update**: Position `devsh` as "the cmux CLI"
2. **Feature parity**: Ensure devsh exposes all provider capabilities
3. **Deprecation path**: Mark Rust `cmux` as internal tooling

---

## 2. Provider Capability Contract

### Current Problem

| CLI | Exposes |
|-----|---------|
| devsh | `morph`, `pve-lxc` |
| cloudrouter | `e2b`, `modal`, `pve-lxc` |
| app server | `E2B`, `PVE LXC`, `Morph` |

### Recommended Provider Strategy

| Provider | Purpose | Priority |
|----------|---------|----------|
| **PVE-LXC** | Cheap long-lived workspaces (primary) | P0 |
| **E2B** | Elastic burst, browser-heavy, managed pause | P0 |
| **Modal** | GPU lanes only | P1 |
| **Morph** | Fallback only (billing issues) | P2 |

### Unified Capability Contract

```typescript
// packages/shared/src/provider-capability-contract.ts
export interface SandboxProviderCapability {
  name: "pve-lxc" | "e2b" | "modal" | "morph";
  supportsHibernate: boolean;
  supportsPause: boolean;
  supportsGpu: boolean;
  startupLatency: "fast" | "medium" | "slow";
  costTier: "low" | "medium" | "high";
}

export const PROVIDER_CAPABILITIES: Record<string, SandboxProviderCapability> = {
  "pve-lxc": {
    name: "pve-lxc",
    supportsHibernate: false,  // stop/start, no RAM state
    supportsPause: true,       // via stop
    supportsGpu: false,
    startupLatency: "fast",    // ~100ms
    costTier: "low",
  },
  "e2b": {
    name: "e2b",
    supportsHibernate: true,   // native pause API
    supportsPause: true,
    supportsGpu: false,
    startupLatency: "fast",
    costTier: "medium",
  },
  // ...
};
```

### Implementation Steps

1. Create `provider-capability-contract.ts` in shared package
2. Update devsh to expose E2B provider
3. Update app server to use unified contract
4. Remove provider-specific code paths where possible

---

## 3. Cost Reduction

### Current vs Target

| Service | Current | Optimized | Savings |
|---------|---------|-----------|---------|
| Sandboxes (Morph) | $200-500/mo | $50-100/mo | 70-80% |
| Web hosting (Vercel) | $0-50/mo | $0/mo | 100% |
| AI tokens | $$$ | $ | 20-60% |
| **Total** | ~$500-1000/mo | ~$100-300/mo | **60-80%** |

### Implementation

#### A. Sandbox Migration (PVE-LXC Primary)

Already implemented:
- `packages/devsh/internal/pvelxc/client.go` (855 lines)
- `apps/edge-router-pvelxc/` Cloudflare Worker
- Daily snapshot workflow

Remaining:
- [ ] Set `SANDBOX_PROVIDER=pve-lxc` as production default
- [ ] Keep Morph as fallback only

#### B. Web Stack Migration (Coolify)

Already implemented:
- `docker-compose.coolify.yml`
- `.env.coolify.example`
- All three apps have Dockerfiles

Remaining (OPS):
- [ ] Deploy Coolify stack to production
- [ ] Configure domains (cmux.karldigi.dev, etc.)
- [ ] Remove Vercel projects

#### C. AI Gateway Routing

Already implemented:
- Base URL override pattern
- NewAPI gateway at `new.karldigi.dev`

Remaining:
- [ ] Configure routing rules in NewAPI
- [ ] Route simple tasks to cheaper models

---

## 4. Instruction Assembly Simplification

### Current Problem

Each provider environment file independently assembles:
- Policy rules section
- Orchestration rules section
- Behavior HOT section
- Memory seed references

### Solution: Shared Instruction Pack Builder

```typescript
// packages/shared/src/agent-instruction-pack.ts
export interface InstructionPack {
  policyRules: string;
  orchestrationRules: string;
  behaviorHot: string;
  memorySeeds: string[];
}

export async function buildInstructionPack(ctx: {
  teamId: string;
  agentName: string;
  isHeadAgent: boolean;
}): Promise<InstructionPack> {
  // Centralized assembly logic
  // Returns formatted sections for injection
}
```

### Implementation Status

**Already exists**: `packages/shared/src/providers/common/agent-instruction-pack.ts`

All 8 providers already use shared builders:
- `buildClaudeMdContent()`
- `buildCodexInstructionsContent()`
- `buildGeminiMdContent()`
- `buildGenericInstructionsContent()`

**No additional work needed** - this was completed in earlier simplification phases.

---

## 5. CLI/Web Feature Parity

### Gap Analysis

| Feature | Web App | devsh | cloudrouter |
|---------|---------|-------|-------------|
| Task creation | ✅ | ✅ | ❌ |
| Task monitoring | ✅ | ✅ | ❌ |
| Orchestration | ✅ | ✅ | ❌ |
| PVE-LXC provider | ✅ | ✅ | ✅ |
| E2B provider | ✅ | ✅ | ✅ |
| Browser automation | ✅ | ✅ | ✅ |
| Local captain mode | ❌ | ✅ | ❌ |
| GPU support | ❌ | ❌ | ✅ |

### Recommended Actions

1. ~~**Add E2B to devsh**: Enable `devsh start --provider e2b`~~ ✅ Complete (2026-03-23)
2. **Add task commands to cloudrouter**: Or document that devsh is primary
3. **Add local replay to web**: Port `devsh orchestrate view` to dashboard

---

## 6. Recommended Implementation Order

| Phase | Task | Effort | Impact | Status |
|-------|------|--------|--------|--------|
| **1** | Coolify web stack cutover | 1 day | High (cost) | OPS |
| **2** | ~~Add E2B provider to devsh~~ | 4 hours | High (parity) | ✅ Done |
| **3** | Set PVE-LXC as default provider | 1 hour | High (cost) | OPS |
| **4** | Configure AI gateway routing | 2 hours | Medium (cost) | OPS |
| **5** | ~~Update docs (devsh as primary CLI)~~ | 2 hours | Medium (UX) | ✅ Done (CLI_GUIDE.md) |
| **6** | ~~Flatten rules pipeline (3 statuses)~~ | 4 hours | Low (simplicity) | ✅ Done (PR #849) |

---

## 7. Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Monthly infra cost | ~$500-1000 | <$300 |
| CLI surfaces for operators | 4 | 2 (devsh + cloudrouter) |
| Provider implementations | 4 | 3 (PVE-LXC, E2B, Modal) |
| Instruction assembly locations | 8 | 1 (shared builder) |

---

## Related Documents

- `docs/OPS_LAUNCH_CHECKLIST.md` - Launch configuration
- `.claude/plans/dev-direction-2026-q2.md` - Q2 roadmap
- Obsidian: `cmux-costreduce-roadmap.md`
- Obsidian: `cmux-agent-platform-simplification-improvement.md`
- Obsidian: `cmux-surface-clarification-pve-e2b-strategy.md`
