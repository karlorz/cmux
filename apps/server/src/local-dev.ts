import { startServer } from "./server";

// Validate critical shared exports are resolvable at startup.
// Bun caches module resolution at startup and does NOT watch package.json files.
// If exports were added while the dev server was running, the cache is stale.
const criticalSharedExports = [
  "@cmux/shared/providers/opencode/configs",
  "@cmux/shared/agentConfig",
  "@cmux/shared/provider-registry",
  "@cmux/shared/resilience",
];

for (const exportPath of criticalSharedExports) {
  try {
    await import(exportPath);
  } catch (e) {
    console.error(`[STARTUP] Failed to resolve ${exportPath}`);
    console.error(`[STARTUP] This usually means package.json exports are stale.`);
    console.error(`[STARTUP] Fix: Restart the dev server with ./scripts/dev.sh`);
    process.exit(1);
  }
}

await startServer({
  port: parseInt(process.env.PORT || "9776"),
});
