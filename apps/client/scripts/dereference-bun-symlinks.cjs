#!/usr/bin/env node
/**
 * Standalone script to dereference Bun's symlinked node_modules
 *
 * Run this in CI BEFORE electron-builder to fix "Cannot find module" errors.
 * Bun creates symlinks to .bun/ cache, which electron-builder's asar packing
 * doesn't properly resolve for nested dependencies.
 *
 * Usage: node scripts/dereference-bun-symlinks.cjs [node_modules_path]
 *
 * WARNING: This modifies node_modules in place. Only use in CI where
 * the workspace will be discarded after the build.
 */

const { join, resolve, dirname, basename } = require("node:path");
const {
  existsSync,
  readdirSync,
  lstatSync,
  readlinkSync,
  rmSync,
  cpSync,
  mkdirSync,
} = require("node:fs");

// Workspace packages are bundled by electron-vite, not needed in node_modules
const WORKSPACE_SCOPES = ["@cmux"];

// Maximum depth to prevent runaway recursion
const MAX_DEPTH = 10;

/**
 * Check if a symlink points to Bun's cache (.bun/ directory)
 */
function isBunCacheSymlink(linkTarget) {
  return linkTarget.includes("node_modules/.bun/") || linkTarget.includes(".bun/");
}

/**
 * Copy sibling dependencies from Bun cache into the package's node_modules.
 *
 * Bun's cache structure places a package's dependencies as symlinks next to
 * the package directory (siblings), not inside it:
 *   .bun/dockerode@4.0.9/node_modules/
 *     dockerode/           <- the actual package
 *     docker-modem -> ...  <- sibling symlink to dependency
 *
 * For Node.js module resolution to work after copying, we need to copy these
 * sibling dependencies into a node_modules folder inside the package.
 */
function copySiblingDependencies(packageDir, bunCacheNodeModulesDir, errors) {
  let copied = 0;

  // Read siblings from the Bun cache node_modules directory
  let siblings;
  try {
    siblings = readdirSync(bunCacheNodeModulesDir);
  } catch (err) {
    errors.push(`Failed to read sibling deps from ${bunCacheNodeModulesDir}: ${err.message}`);
    return copied;
  }

  const packageName = basename(packageDir);
  const nestedNodeModules = join(packageDir, "node_modules");

  for (const sibling of siblings) {
    // Skip hidden files, .bin, and the package itself
    if (sibling.startsWith(".") || sibling === packageName) continue;

    const siblingPath = join(bunCacheNodeModulesDir, sibling);

    try {
      const stat = lstatSync(siblingPath);

      if (stat.isSymbolicLink()) {
        // This is a dependency symlink - resolve and copy it
        const linkTarget = readlinkSync(siblingPath);
        const resolvedTarget = resolve(dirname(siblingPath), linkTarget);

        if (!existsSync(resolvedTarget)) {
          errors.push(`Sibling symlink target does not exist: ${siblingPath} -> ${resolvedTarget}`);
          continue;
        }

        // Create nested node_modules if needed
        if (!existsSync(nestedNodeModules)) {
          mkdirSync(nestedNodeModules, { recursive: true });
        }

        const destPath = join(nestedNodeModules, sibling);
        if (!existsSync(destPath)) {
          cpSync(resolvedTarget, destPath, { recursive: true, dereference: true });
          copied++;
        }
      } else if (stat.isDirectory()) {
        // This is a scoped package directory (@org) - process its contents
        const scopeDir = siblingPath;
        let scopeEntries;
        try {
          scopeEntries = readdirSync(scopeDir);
        } catch (err) {
          continue;
        }

        for (const scopeEntry of scopeEntries) {
          if (scopeEntry.startsWith(".")) continue;

          const scopeEntryPath = join(scopeDir, scopeEntry);
          const scopeStat = lstatSync(scopeEntryPath);

          if (scopeStat.isSymbolicLink()) {
            const linkTarget = readlinkSync(scopeEntryPath);
            const resolvedTarget = resolve(dirname(scopeEntryPath), linkTarget);

            if (!existsSync(resolvedTarget)) continue;

            // Create nested node_modules/@scope if needed
            const nestedScopeDir = join(nestedNodeModules, sibling);
            if (!existsSync(nestedScopeDir)) {
              mkdirSync(nestedScopeDir, { recursive: true });
            }

            const destPath = join(nestedScopeDir, scopeEntry);
            if (!existsSync(destPath)) {
              cpSync(resolvedTarget, destPath, { recursive: true, dereference: true });
              copied++;
            }
          }
        }
      }
    } catch (err) {
      errors.push(`Error copying sibling ${sibling}: ${err.message}`);
    }
  }

  return copied;
}

/**
 * Recursively find and replace symlinks with real copies
 * Only processes .bun cache symlinks, skips workspace packages
 */
function dereferenceSymlinks(nodeModulesDir, depth = 0, visited = new Set()) {
  if (!existsSync(nodeModulesDir) || depth > MAX_DEPTH) {
    return { replaced: 0, errors: [] };
  }

  const realPath = resolve(nodeModulesDir);
  if (visited.has(realPath)) {
    return { replaced: 0, errors: [] };
  }
  visited.add(realPath);

  let replaced = 0;
  const errors = [];

  let entries;
  try {
    entries = readdirSync(nodeModulesDir);
  } catch (err) {
    errors.push(`Failed to read ${nodeModulesDir}: ${err.message}`);
    return { replaced, errors };
  }

  for (const entry of entries) {
    // Skip hidden files and .bin directory
    if (entry.startsWith(".")) continue;

    const entryPath = join(nodeModulesDir, entry);

    // Handle scoped packages (@org/package)
    if (entry.startsWith("@")) {
      // Skip workspace scopes entirely - they're bundled by electron-vite
      if (WORKSPACE_SCOPES.includes(entry)) {
        continue;
      }
      const scopeResult = dereferenceSymlinks(entryPath, depth, visited);
      replaced += scopeResult.replaced;
      errors.push(...scopeResult.errors);
      continue;
    }

    try {
      const stat = lstatSync(entryPath);

      if (stat.isSymbolicLink()) {
        // Read the symlink target
        const linkTarget = readlinkSync(entryPath);
        const resolvedTarget = resolve(dirname(entryPath), linkTarget);

        // Only dereference .bun cache symlinks
        if (!isBunCacheSymlink(linkTarget)) {
          continue;
        }

        if (!existsSync(resolvedTarget)) {
          errors.push(`Symlink target does not exist: ${entryPath} -> ${resolvedTarget}`);
          continue;
        }

        // Remove the symlink (recursive: true needed for symlinks to directories in Node 24+)
        rmSync(entryPath, { force: true, recursive: true });

        // Copy the real directory and flatten any nested .bun symlinks so dependencies
        // like docker-modem are materialized instead of pointing at non-existent targets
        cpSync(resolvedTarget, entryPath, { recursive: true, dereference: true });
        replaced++;

        // Copy sibling dependencies from Bun cache into the package's node_modules.
        // Bun places dependencies as siblings in the cache (e.g., docker-modem next to
        // dockerode), but Node.js expects them in node_modules for resolution.
        const bunCacheNodeModulesDir = dirname(resolvedTarget);
        const siblingsCopied = copySiblingDependencies(entryPath, bunCacheNodeModulesDir, errors);
        replaced += siblingsCopied;

        // Recurse into the newly copied directory to handle nested node_modules
        const nestedNodeModules = join(entryPath, "node_modules");
        if (existsSync(nestedNodeModules)) {
          const nestedResult = dereferenceSymlinks(nestedNodeModules, depth + 1, visited);
          replaced += nestedResult.replaced;
          errors.push(...nestedResult.errors);
        }
      } else if (stat.isDirectory()) {
        // Check for nested node_modules in real directories too
        const nestedNodeModules = join(entryPath, "node_modules");
        if (existsSync(nestedNodeModules)) {
          const nestedResult = dereferenceSymlinks(nestedNodeModules, depth + 1, visited);
          replaced += nestedResult.replaced;
          errors.push(...nestedResult.errors);
        }
      }
    } catch (err) {
      errors.push(`Error processing ${entryPath}: ${err.message}`);
    }
  }

  return { replaced, errors };
}

// Main execution when run as script
if (require.main === module) {
  const nodeModulesDir = process.argv[2] || join(__dirname, "..", "node_modules");

  console.log(`[dereference-bun-symlinks] Processing: ${nodeModulesDir}`);

  if (!existsSync(nodeModulesDir)) {
    console.log("[dereference-bun-symlinks] No node_modules found, nothing to do");
    process.exit(0);
  }

  const startTime = Date.now();
  const result = dereferenceSymlinks(nodeModulesDir);
  const duration = Date.now() - startTime;

  console.log(`[dereference-bun-symlinks] Replaced ${result.replaced} symlinks in ${duration}ms`);

  if (result.errors.length > 0) {
    console.warn("[dereference-bun-symlinks] Warnings:");
    for (const error of result.errors) {
      console.warn(`  - ${error}`);
    }
  }

  process.exit(0);
}

// Also export for programmatic use
module.exports = { dereferenceSymlinks };
