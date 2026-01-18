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

const { join, resolve, dirname } = require("node:path");
const {
  existsSync,
  readdirSync,
  lstatSync,
  readlinkSync,
  unlinkSync,
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
 * Copy sibling dependencies from Bun's cache structure.
 *
 * Bun hoists dependencies as siblings in the cache:
 *   .bun/dockerode@4.0.9/node_modules/
 *     dockerode/           <- the actual package
 *     docker-modem -> ../../docker-modem@5.0.6/node_modules/docker-modem
 *     protobufjs -> ...
 *
 * When we copy dockerode, we also need to copy docker-modem etc. into
 * dockerode/node_modules/ so Node.js resolution works in the asar.
 *
 * Additionally, when a sibling (like docker-modem) is itself a symlink
 * pointing to another versioned directory in Bun's cache, we need to
 * recursively copy its siblings too (like readable-stream, split-ca).
 */
function copySiblingDependencies(sourceDir, targetPkgDir, errors, depth = 0) {
  // Prevent infinite recursion
  if (depth > MAX_DEPTH) {
    return 0;
  }

  // sourceDir is e.g. .bun/dockerode@4.0.9/node_modules/dockerode
  // We need to look at siblings in .bun/dockerode@4.0.9/node_modules/
  const bunNodeModules = dirname(sourceDir);
  const pkgName = sourceDir.split("/").pop();

  let siblings;
  try {
    siblings = readdirSync(bunNodeModules);
  } catch {
    return 0;
  }

  let copied = 0;
  for (const sibling of siblings) {
    // Skip the package itself and hidden entries
    if (sibling === pkgName || sibling.startsWith(".")) continue;

    const siblingPath = join(bunNodeModules, sibling);
    let stat;
    try {
      stat = lstatSync(siblingPath);
    } catch {
      continue;
    }

    // Handle scoped packages (@org/pkg)
    if (sibling.startsWith("@") && stat.isDirectory()) {
      let scopedPkgs;
      try {
        scopedPkgs = readdirSync(siblingPath);
      } catch {
        continue;
      }
      for (const scopedPkg of scopedPkgs) {
        const scopedPath = join(siblingPath, scopedPkg);
        const targetScopedDir = join(targetPkgDir, "node_modules", sibling);
        const targetScopedPath = join(targetScopedDir, scopedPkg);

        // Skip if already exists
        if (existsSync(targetScopedPath)) continue;

        try {
          const scopedStat = lstatSync(scopedPath);
          let copySource = scopedPath;
          let wasSymlink = false;

          if (scopedStat.isSymbolicLink()) {
            const linkTarget = readlinkSync(scopedPath);
            copySource = resolve(dirname(scopedPath), linkTarget);
            if (!existsSync(copySource)) continue;
            wasSymlink = true;
          }

          mkdirSync(targetScopedDir, { recursive: true });
          cpSync(copySource, targetScopedPath, { recursive: true, dereference: true });
          copied++;

          // If this was a symlink, recursively copy its siblings from Bun's cache
          if (wasSymlink && isBunCacheSymlink(copySource)) {
            const nestedCopied = copySiblingDependencies(copySource, targetScopedPath, errors, depth + 1);
            copied += nestedCopied;
          }
        } catch (err) {
          errors.push(`Failed to copy scoped sibling ${sibling}/${scopedPkg}: ${err.message}`);
        }
      }
      continue;
    }

    // Target location: inside the package's node_modules
    const targetPath = join(targetPkgDir, "node_modules", sibling);

    // Skip if already exists
    if (existsSync(targetPath)) continue;

    let copySource = siblingPath;
    let wasSymlink = false;

    // If sibling is a symlink, resolve it
    if (stat.isSymbolicLink()) {
      const linkTarget = readlinkSync(siblingPath);
      copySource = resolve(dirname(siblingPath), linkTarget);
      if (!existsSync(copySource)) {
        errors.push(`Sibling symlink target missing: ${sibling} -> ${copySource}`);
        continue;
      }
      wasSymlink = true;
    }

    try {
      mkdirSync(join(targetPkgDir, "node_modules"), { recursive: true });
      cpSync(copySource, targetPath, { recursive: true, dereference: true });
      copied++;

      // If this was a symlink pointing into Bun's cache, recursively copy its
      // siblings. This handles transitive dependencies like docker-modem's
      // readable-stream, split-ca, etc.
      if (wasSymlink && isBunCacheSymlink(copySource)) {
        const nestedCopied = copySiblingDependencies(copySource, targetPath, errors, depth + 1);
        copied += nestedCopied;
      }
    } catch (err) {
      errors.push(`Failed to copy sibling ${sibling}: ${err.message}`);
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

        // Remove the symlink (use unlinkSync, not rmSync, because rmSync follows
        // symlinks to directories in Node 24+ and fails with ERR_FS_EISDIR)
        unlinkSync(entryPath);

        // Copy the real directory and flatten any nested .bun symlinks so dependencies
        // like docker-modem are materialized instead of pointing at non-existent targets
        cpSync(resolvedTarget, entryPath, { recursive: true, dereference: true });
        replaced++;

        // Copy sibling dependencies from Bun's cache structure into the package's
        // node_modules so Node.js resolution works inside the asar
        const siblingsCopied = copySiblingDependencies(resolvedTarget, entryPath, errors);
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
