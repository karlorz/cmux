# Plan: Fix Morph Snapshot Disk Space Issue

## Problem Analysis

The Daily Morph Snapshot workflow is failing with the error:
```
RuntimeError: configure-memory-protection failed with exit code 1
Swapfile /var/swap/cmux-swapfile missing from /proc/swaps after configuration.
```

### Root Cause

The `configure-memory-protection` task attempts to create a **6 GiB swapfile** (`CMUX_SWAPFILE_SIZE_GIB=6`), but there isn't enough disk space available on the 32GB VM.

**Disk space breakdown:**
- Total disk: 32 GB
- Swapfile (current): 6 GiB (~6.4 GB)
- Safety margin required: 512 MiB
- Approximate installed software: ~18-22 GB (base packages, VS Code, Rust toolchain, Node.js, Go, IDE extensions, etc.)
- User workspace reserve needed: ~5-8 GB

The script at `configs/systemd/bin/cmux-configure-memory` checks available disk space:
```bash
avail_blocks="$(stat -f --format='%a' "$swapfile_dir" 2>/dev/null || echo 0)"
block_size="$(stat -f --format='%S' "$swapfile_dir" 2>/dev/null || echo 1)"
avail_bytes=$((avail_blocks * block_size))
required_bytes=$((swapfile_bytes + 512 * 1024 * 1024)) # include 512MiB safety margin
if [ "$avail_bytes" -lt "$required_bytes" ]; then
  log "Insufficient disk space for ${swapfile_size_gib}GiB swapfile..."
  ensure_swapfile=0
fi
```

When disk space is insufficient, the script sets `ensure_swapfile=0` and skips creation, but the **validation in `task_configure_memory_protection`** strictly requires the swapfile to exist in `/proc/swaps`.

---

## Solution Options

### Option A: Reduce Swapfile Size (Recommended)

Reduce the swapfile from 6 GiB to 4 GiB. This is the minimum already configured in `cmux-configure-memory`:
```bash
if [ "$swapfile_size_gib" -lt 4 ]; then
  swapfile_size_gib=4
fi
```

**Changes required:**
1. Modify `scripts/snapshot.py` line 1946:
   ```python
   # Before:
   CMUX_FORCE_SWAP=1 CMUX_SWAPFILE_SIZE_GIB=6 /usr/local/sbin/cmux-configure-memory

   # After:
   CMUX_FORCE_SWAP=1 CMUX_SWAPFILE_SIZE_GIB=4 /usr/local/sbin/cmux-configure-memory
   ```

2. Update validation check (lines 1947-1970) to expect 4 GiB:
   ```python
   expected_kib=$((4 * 1024 * 1024))  # Changed from 6 to 4
   ```

**Pros:**
- Simple fix
- Saves 2 GiB disk space
- 4 GiB swap + zram (50% of 8 GiB RAM = 4 GiB compressed) provides adequate memory protection

**Cons:**
- Slightly reduced swap capacity (but zram compensates)

---

### Option B: Make Swapfile Validation Conditional

Make the post-creation validation more lenient when disk space is insufficient.

**Changes required:**
1. Modify the validation script to check if swapfile was skipped due to disk space and treat that as acceptable:
   ```bash
   # Check if swapfile exists in /proc/swaps
   actual_kib="$(awk '$1 == "/var/swap/cmux-swapfile" {print $3}' /proc/swaps 2>/dev/null || true)"
   if [ -z "${actual_kib}" ]; then
       # Check if it was skipped due to disk space (file doesn't exist)
       if [ ! -f "/var/swap/cmux-swapfile" ]; then
           echo "Swapfile creation was skipped (likely insufficient disk space); continuing." >&2
           exit 0  # Allow build to continue
       fi
       echo "Swapfile missing from /proc/swaps after configuration." >&2
       exit 1
   fi
   ```

**Pros:**
- More resilient to disk space variations
- Build won't fail if swapfile can't be created

**Cons:**
- VMs might run without swapfile protection
- Could mask real failures

---

### Option C: Increase VM Disk Size (Infrastructure Change)

Increase the default disk size from 32 GB to 40+ GB.

**Changes required:**
1. Update `.github/workflows/morph-snapshot.yml`:
   ```yaml
   STANDARD_DISK_SIZE: ${{ vars.MORPH_STANDARD_DISK_SIZE || '40960' }}  # 40 GB
   BOOSTED_DISK_SIZE: ${{ vars.MORPH_BOOSTED_DISK_SIZE || '40960' }}    # 40 GB
   ```

2. Update `packages/shared/src/morph-snapshots.json` preset labels

**Pros:**
- More headroom for everything
- No compromises on swap size

**Cons:**
- Requires Morph infrastructure support for larger disks
- User mentioned 32GB VM disk limit, so this may not be possible
- Higher cost

---

### Option D: Dynamic Swapfile Size Based on Disk

Modify `task_configure_memory_protection` to calculate swapfile size based on available disk space.

**Changes required:**
1. Calculate available space and adjust swapfile size:
   ```bash
   # Calculate available disk space
   avail_gib=$(df --output=avail /var/swap 2>/dev/null | tail -1 | awk '{print int($1/1024/1024)}')

   # Reserve 8 GiB for user workspace, 512 MiB safety margin
   max_swap_gib=$((avail_gib - 9))

   # Clamp between 2 and 6 GiB
   swap_gib=$max_swap_gib
   [ "$swap_gib" -gt 6 ] && swap_gib=6
   [ "$swap_gib" -lt 2 ] && swap_gib=2

   CMUX_FORCE_SWAP=1 CMUX_SWAPFILE_SIZE_GIB=$swap_gib /usr/local/sbin/cmux-configure-memory
   ```

**Pros:**
- Automatically adapts to available space
- Future-proof

**Cons:**
- More complex
- Variable swap size across deployments

---

## Recommended Solution: Option A

Given your 32GB disk limit constraint, **Option A (reduce swapfile to 4 GiB)** is the best choice:

1. It's the simplest fix
2. 4 GiB swap + 4 GiB zram provides 8 GiB effective memory protection
3. Saves 2 GiB disk space (6 GiB -> 4 GiB = ~2 GB saved)
4. Maintains strict validation (no silent failures)

### Implementation Steps

1. **Edit `scripts/snapshot.py`** (around line 1942-1973):
   - Change `CMUX_SWAPFILE_SIZE_GIB=6` to `CMUX_SWAPFILE_SIZE_GIB=4`
   - Update the validation to expect 4 GiB instead of 6 GiB

2. **Run `bun check`** to verify no type errors

3. **Test locally** (if possible):
   ```bash
   uv run --env-file .env ./scripts/snapshot.py \
     --snapshot-id snapshot_7wbqo5jd \
     --standard-vcpus 4 \
     --standard-memory 8192 \
     --standard-disk-size 32768 \
     --boosted-vcpus 6 \
     --boosted-memory 8192 \
     --boosted-disk-size 32768
   ```

4. **Commit and push** to trigger the workflow

---

## Additional Optimization (Optional)

To further save disk space, consider:

1. **Clean apt cache after installs** - add `apt-get clean && rm -rf /var/lib/apt/lists/*`
2. **Remove Rust build artifacts** - add `cargo clean` or remove `~/.cargo/registry` after build
3. **Use smaller IDE extensions** - review which extensions are truly necessary

---

## Files to Modify

| File | Change |
|------|--------|
| `scripts/snapshot.py` | Lines 1946-1970: Change swapfile size from 6 GiB to 4 GiB |

---

## Verification

After the fix:
1. The workflow should complete successfully
2. The swapfile should appear in `/proc/swaps` with ~4 GiB size
3. Total disk usage should leave at least 5-8 GB free for user workspace
