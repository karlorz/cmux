#!/usr/bin/env bun
/**
 * Seed script to pull all Stack Auth users and teams into Convex database
 *
 * Usage:
 *   bun scripts/seed-stack-auth.ts
 *
 * Options (via environment variables):
 *   SEED_USERS=true/false           - Backfill users (default: true)
 *   SEED_TEAMS=true/false           - Backfill teams (default: true)
 *   SEED_MEMBERSHIPS=true/false     - Backfill team memberships (default: true)
 *   SEED_PAGE_SIZE=number           - Page size for pagination (default: 200, max: 500)
 *   SEED_INCLUDE_ANONYMOUS=true/false - Include anonymous users (default: false)
 *   SEED_DRY_RUN=true/false         - Dry run mode (default: false)
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "@cmux/convex/api";
import process from "node:process";

const CONVEX_URL = process.env.CONVEX_URL;
const CONVEX_ADMIN_KEY = process.env.CONVEX_DEPLOY_KEY;

if (!CONVEX_URL) {
  console.error("Error: CONVEX_URL environment variable is required");
  console.error("Example: CONVEX_URL=https://your-deployment.convex.cloud");
  process.exit(1);
}

if (!CONVEX_ADMIN_KEY) {
  console.error("Error: CONVEX_DEPLOY_KEY environment variable is required");
  console.error("This should be your Convex deployment key for admin access");
  process.exit(1);
}

// Parse options from environment variables
const options = {
  users: process.env.SEED_USERS !== "false",
  teams: process.env.SEED_TEAMS !== "false",
  memberships: process.env.SEED_MEMBERSHIPS !== "false",
  pageSize: process.env.SEED_PAGE_SIZE
    ? parseInt(process.env.SEED_PAGE_SIZE, 10)
    : undefined,
  includeAnonymous: process.env.SEED_INCLUDE_ANONYMOUS === "true",
  dryRun: process.env.SEED_DRY_RUN === "true",
};

console.log("🌱 Starting Stack Auth seed script...");
console.log("Options:", options);

const client = new ConvexHttpClient(CONVEX_URL);
client.setAdminAuth(CONVEX_ADMIN_KEY);

try {
  console.log("\n📥 Fetching data from Stack Auth and syncing to Convex...");

  const result = await client.action(api.backfill.backfillFromStack, options);

  console.log("\n✅ Seed completed successfully!");
  console.log(`   - Users processed: ${result.usersProcessed}`);
  console.log(`   - Teams processed: ${result.teamsProcessed}`);
  console.log(`   - Memberships processed: ${result.membershipsProcessed}`);

  if (options.dryRun) {
    console.log("\n⚠️  Dry run mode: No data was actually written to the database");
  }
} catch (error) {
  console.error("\n❌ Seed failed:", error);
  process.exit(1);
} finally {
  client.close();
}
