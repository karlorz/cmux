#!/usr/bin/env bun
/**
 * Production build script for cmux-devbox-lite E2B template.
 * Uses the E2B SDK v2 programmatic API to build templates.
 */

import { buildTemplate } from "./template";

async function main() {
  console.log("[build.prod] Starting production template build...");

  try {
    const result = await buildTemplate({
      mode: "prod",
      // Production builds use full resources
      cpuCount: 4,
      memoryMb: 16384,
    });

    console.log("[build.prod] Template built successfully!");
    console.log(`  Template ID: ${result.templateId}`);
    console.log(`  Build ID: ${result.buildId}`);
    if (result.logs) {
      console.log("\n[build.prod] Build logs:");
      console.log(result.logs);
    }
  } catch (error) {
    console.error("[build.prod] Template build failed:", error);
    process.exit(1);
  }
}

main();
