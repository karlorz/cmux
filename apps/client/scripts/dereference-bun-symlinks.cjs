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
 * Check if a path is in Bun's cache (.bun/ directory)
 * Can check either relative link targets or resolved absolute paths.
 */
function isBunCachePath(pathToCheck) {
  return pathToCheck.includes("node_modules/.bun/") || pathToCheck.includes(".bun/");
}

/**
 * Copy sibling dependencies from Bun cache into package's node_modules.
 *
 * Bun's cache structure puts dependencies as siblings:
 *   .bun/dockerode@4.0.9/node_modules/
 *     dockerode/          <- the package
 *     docker-modem -> ..  <- sibling symlink dependency
 *
 * Node.js resolution expects nested or hoisted deps, so we copy
 * sibling symlinks into the package's own node_modules/.
 */
function copySiblingDependencies(entryPath, resolvedTarget) {
  // resolvedTarget is e.g. /root/.../node_modules/.bun/dockerode@4.0.9/node_modules/dockerode
  // siblingDir is the parent: /root/.../node_modules/.bun/dockerode@4.0.9/node_modules/
  const siblingDir = dirname(resolvedTarget);
  const packageName = basename(resolvedTarget);

  let siblings;
  try {
    siblings = readdirSync(siblingDir);
  } catch {
    return 0;
  }

  let copied = 0;

  for (const sibling of siblings) {
    // Skip the package itself, hidden files, and .bin
    if (sibling === packageName || sibling.startsWith(".")) continue;

    const siblingPath = join(siblingDir, sibling);

    try {
      const stat = lstatSync(siblingPath);

      // Only process symlinks (Bun's dependency links)
      if (!stat.isSymbolicLink()) continue;

      const linkTarget = readlinkSync(siblingPath);
      const resolvedSibling = resolve(siblingDir, linkTarget);

      // Only copy .bun cache symlinks (check resolved path for relative links)
      if (!isBunCachePath(linkTarget) && !isBunCachePath(resolvedSibling)) continue;
      if (!existsSync(resolvedSibling)) continue;

      // Create package's node_modules if needed
      const nestedNodeModules = join(entryPath, "node_modules");
      if (!existsSync(nestedNodeModules)) {
        mkdirSync(nestedNodeModules, { recursive: true });
      }

      // Handle scoped packages (@org/package)
      let destPath;
      if (sibling.startsWith("@")) {
        // sibling is a scope dir, need to copy its contents
        const scopeDir = join(nestedNodeModules, sibling);
        if (!existsSync(scopeDir)) {
          mkdirSync(scopeDir, { recursive: true });
        }
        // The symlink points to the actual scoped package
        destPath = join(nestedNodeModules, sibling);
      } else {
        destPath = join(nestedNodeModules, sibling);
      }

      // Skip if already exists (hoisted or previously copied)
      if (existsSync(destPath)) continue;

      // Copy with dereference to flatten nested symlinks
      cpSync(resolvedSibling, destPath, { recursive: true, dereference: true });
      copied++;
    } catch {
      // Ignore errors for individual siblings
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

        // Only dereference .bun cache symlinks (check resolved path for relative links)
        if (!isBunCachePath(linkTarget) && !isBunCachePath(resolvedTarget)) {
          continue;
        }

        if (!existsSync(resolvedTarget)) {
          errors.push(`Symlink target does not exist: ${entryPath} -> ${resolvedTarget}`);
          continue;
        }

        // Remove the symlink (recursive needed for symlinks to directories)
        rmSync(entryPath, { force: true, recursive: true });

        // Copy the real directory and flatten any nested .bun symlinks so dependencies
        // like docker-modem are materialized instead of pointing at non-existent targets
        cpSync(resolvedTarget, entryPath, { recursive: true, dereference: true });
        replaced++;

        // Copy sibling dependencies from Bun cache into package's node_modules
        // This handles Bun's flat structure where deps are siblings, not nested
        replaced += copySiblingDependencies(entryPath, resolvedTarget);

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
