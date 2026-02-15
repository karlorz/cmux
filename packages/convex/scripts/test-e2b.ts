#!/usr/bin/env bun
/**
 * Test script for E2B integration.
 * Run with: cd packages/convex && bun run scripts/test-e2b.ts
 *
 * Requires E2B_API_KEY in environment or .env file.
 *
 * Options:
 *   --template <id>   Use custom template ID (default: "base" for free tier)
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { E2BClient } from "@cmux/e2b-client";
import { DEFAULT_E2B_TEMPLATE_ID } from "@cmux/shared/e2b-templates";

// Load .env from project root
config({ path: resolve(import.meta.dir, "../../../.env") });

const E2B_API_KEY = process.env.E2B_API_KEY;

// Parse CLI args for --template
function getTemplateId(): string {
  const args = process.argv.slice(2);
  const templateIdx = args.indexOf("--template");
  if (templateIdx !== -1 && args[templateIdx + 1]) {
    return args[templateIdx + 1];
  }
  // Default to "base" for free tier compatibility
  // Use --template flag to test custom templates
  return process.env.E2B_TEMPLATE_ID || "base";
}

async function main() {
  console.log("Testing E2B integration...\n");

  if (!E2B_API_KEY) {
    console.error("E2B_API_KEY not found in environment or .env file");
    console.error("Please set E2B_API_KEY=e2b_xxx in your .env file");
    process.exit(1);
  }

  const templateId = getTemplateId();

  console.log("E2B API Key:", E2B_API_KEY.slice(0, 10) + "...");
  console.log("Template ID:", templateId);
  console.log("(cmux default:", DEFAULT_E2B_TEMPLATE_ID, ")");
  console.log("");
  console.log("Tip: Use --template <id> to test custom templates");
  console.log("     Set E2B_TEMPLATE_ID in .env to change default");

  const client = new E2BClient({ apiKey: E2B_API_KEY });

  try {
    // Test 1: Start a sandbox
    console.log("\n1. Starting E2B sandbox...");
    const instance = await client.instances.start({
      templateId,
      ttlSeconds: 300, // 5 minutes for testing
      metadata: { test: "true" },
    });
    console.log("   Instance ID:", instance.id);
    console.log("   Status:", instance.status);
    console.log("   VSCode URL:", instance.networking.httpServices.find(s => s.port === 39378)?.url);
    console.log("   VNC URL:", instance.networking.httpServices.find(s => s.port === 39380)?.url);

    // Test 2: Check if running
    console.log("\n2. Checking if sandbox is running...");
    const isRunning = await instance.isRunning();
    console.log("   Is Running:", isRunning);

    // Test 3: Execute a command
    console.log("\n3. Executing test command...");
    const execResult = await instance.exec("echo 'Hello from E2B!' && uname -a");
    console.log("   Exit Code:", execResult.exit_code);
    console.log("   Stdout:", execResult.stdout.trim());
    if (execResult.stderr) {
      console.log("   Stderr:", execResult.stderr.trim());
    }

    // Test 4: List all sandboxes
    console.log("\n4. Listing all running sandboxes...");
    const sandboxes = await client.instances.list();
    console.log("   Total sandboxes:", sandboxes.length);
    for (const sb of sandboxes) {
      console.log(`   - ${sb.sandboxId} (template: ${sb.templateId})`);
    }

    // Test 5: Stop the sandbox
    console.log("\n5. Stopping test sandbox...");
    await instance.stop();
    console.log("   Sandbox stopped");

    console.log("\n All E2B tests passed!");
  } catch (error) {
    console.error("\n E2B test failed:", error);
    process.exit(1);
  }
}

main();
