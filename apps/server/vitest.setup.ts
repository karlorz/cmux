/**
 * Vitest setup file - runs before tests are loaded
 * Ensures environment variables are available before modules are imported
 */
import dotenv from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../.env");

if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Mock env module for tests that run without full env
// This mock will only be used if the real env fails to load
vi.mock("./src/utils/server-env", async (importOriginal) => {
  try {
    // Try to use the real module if env vars are present
    return await importOriginal();
  } catch {
    // Fall back to mock with minimal required values
    return {
      env: {
        NEXT_PUBLIC_CONVEX_URL: "https://test.convex.cloud",
        NEXT_PUBLIC_WWW_ORIGIN: "http://localhost:9779",
        CONVEX_SITE_URL: "https://test.convex.site",
        NEXT_PUBLIC_WEB_MODE: false,
        ENABLE_CIRCUIT_BREAKER: false,
        CMUX_INTERNAL_SECRET: "test-internal-secret",
        CMUX_SERVER_URL: "http://localhost:9779",
        WWW_INTERNAL_URL: "http://localhost:9779",
        CMUX_TASK_RUN_JWT_SECRET: "test-jwt-secret",
        DEFAULT_SANDBOX_TIMEZONE: "America/Los_Angeles",
      },
      getWwwBaseUrl: () => "http://localhost:9779",
      getConvexSiteUrl: () => "https://test.convex.site",
      getServerInternalUrl: () => "http://localhost:9779",
    };
  }
});
