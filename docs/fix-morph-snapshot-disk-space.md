# Plan: Fix Morph Snapshot Disk Space Issue

## Problem Analysis

The Daily Morph Snapshot workflow is failing with:
```
RuntimeError: configure-memory-protection failed with exit code 1
Swapfile /var/swap/cmux-swapfile missing from /proc/swaps after configuration.
```

### Root Cause

The `configure-memory-protection` task attempts to create a **6 GiB swapfile**, but insufficient disk space remains on the 32GB VM after installing all required software.

**Disk space breakdown (32 GB total):**
| Component | Size |
|-----------|------|
| Base OS + apt packages | ~4 GB |
| Node.js, Bun, Go, Rust toolchains | ~3 GB |
| VS Code server + extensions | ~2 GB |
| Rust compiled binaries + cargo cache | ~4 GB |
| Python (uv) + misc tools | ~1 GB |
| Swapfile (current config) | 6 GB |
| Safety margin | 0.5 GB |
| **Subtotal** | **~20.5 GB** |
| **Remaining for user workspace** | **~11.5 GB** |

The issue: When disk usage fluctuates during build (temp files, parallel downloads), available space can drop below the 6.5 GB required (6 GB swap + 512 MB margin), causing swapfile creation to be skipped silently, then failing validation.

---

## Recommended Solution: Reduce Swapfile to 2 GiB

Reduce the swapfile from 6 GiB to **2 GiB**.

### Why 2 GiB is Sufficient

| Memory Layer | Size | Notes |
|--------------|------|-------|
| Physical RAM | 8 GB | Base memory |
| zram (compressed) | ~4 GB | 50% of RAM, ~2-3x compression ratio = 8-12 GB effective |
| Swapfile | 2 GB | Disk-backed fallback |
| **Total effective** | **~18-22 GB** | More than adequate for coding workloads |

The zram layer (already configured) provides the primary swap with high-speed compressed memory. The disk swapfile serves as a secondary fallback for extreme cases.

### Disk Space Savings

| Config | Swapfile | Free Space for User |
|--------|----------|---------------------|
| Current (6 GB) | 6 GB | ~11.5 GB |
| **New (2 GB)** | **2 GB** | **~15.5 GB** |

---

## Implementation

### File: `scripts/snapshot.py`

**Location:** Lines 1942-1973 (`task_configure_memory_protection`)

**Change 1:** Update swapfile size (line 1946)
```bash
# Before:
CMUX_FORCE_SWAP=1 CMUX_SWAPFILE_SIZE_GIB=6 /usr/local/sbin/cmux-configure-memory

# After:
CMUX_FORCE_SWAP=1 CMUX_SWAPFILE_SIZE_GIB=2 /usr/local/sbin/cmux-configure-memory
```

**Change 2:** Update validation expected size (line 1947)
```bash
# Before:
expected_kib=$((6 * 1024 * 1024))

# After:
expected_kib=$((2 * 1024 * 1024))
```

---

## Verification Steps

1. **Run `bun check`** - Ensure no type errors

2. **Trigger workflow:**
   ```bash
   gh workflow run "Daily Morph Snapshot" --repo karlorz/cmux --ref main
   ```

3. **Expected results:**
   - Workflow completes successfully
   - Swapfile appears in `/proc/swaps` with ~2 GiB
   - Snapshot JSON updated with new snapshot IDs

---

## Files to Modify

| File | Lines | Change |
|------|-------|--------|
| `scripts/snapshot.py` | 1946 | `CMUX_SWAPFILE_SIZE_GIB=6` -> `CMUX_SWAPFILE_SIZE_GIB=2` |
| `scripts/snapshot.py` | 1947 | `expected_kib=$((6 * 1024 * 1024))` -> `expected_kib=$((2 * 1024 * 1024))` |
