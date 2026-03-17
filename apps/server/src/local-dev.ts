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

await Promise.all(
  criticalSharedExports.map(async (exportPath) => {
    try {
      await import(exportPath);
    } catch (e) {
      console.error(
        `[STARTUP] Failed to resolve ${exportPath}\n` +
          `  This usually means package.json exports are stale.\n` +
          `  Fix: Restart the dev server with ./scripts/dev.sh\n` +
          `  Error: ${e instanceof Error ? e.message : String(e)}`
      );
      process.exit(1);
    }
  })
);

await startServer({
  port: parseInt(process.env.PORT || "9776"),
});
