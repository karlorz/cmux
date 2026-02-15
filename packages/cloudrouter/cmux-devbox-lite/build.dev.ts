#!/usr/bin/env bun
/**
 * Development build script for cmux-devbox-lite E2B template.
 * Uses the E2B SDK v2 programmatic API to build templates.
 */

import { buildTemplate } from "./template";

async function main() {
  console.log("[build.dev] Starting development template build...");

  try {
    const result = await buildTemplate({
      mode: "dev",
      // Dev builds use smaller resources for faster iteration
      cpuCount: 4,
      memoryMb: 8192,
    });

    console.log("[build.dev] Template built successfully!");
    console.log(`  Template ID: ${result.templateId}`);
    console.log(`  Build ID: ${result.buildId}`);
    if (result.logs) {
      console.log("\n[build.dev] Build logs:");
      console.log(result.logs);
    }
  } catch (error) {
    console.error("[build.dev] Template build failed:", error);
    process.exit(1);
  }
}

main();
