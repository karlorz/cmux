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
vi.mock("./lib/utils/www-env", async (importOriginal) => {
  try {
    // Try to use the real module if env vars are present
    return await importOriginal();
  } catch {
    // Fall back to mock with minimal required values
    return {
      env: {
        // Client env vars (minimal for tests)
        NEXT_PUBLIC_STACK_PROJECT_ID: "test-project-id",
        NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY: "test-client-key",
        NEXT_PUBLIC_CONVEX_URL: "https://test.convex.cloud",
        // Server env vars used by branch-name-generator
        GEMINI_API_KEY: undefined,
        OPENAI_API_KEY: undefined,
        ANTHROPIC_API_KEY: undefined,
        // Other required server vars
        STACK_SECRET_SERVER_KEY: "test-secret",
        STACK_SUPER_SECRET_ADMIN_KEY: "test-admin-secret",
        STACK_DATA_VAULT_SECRET: "a".repeat(32),
        CMUX_GITHUB_APP_ID: "test-app-id",
        CMUX_GITHUB_APP_PRIVATE_KEY: "test-private-key",
        CMUX_TASK_RUN_JWT_SECRET: "test-jwt-secret",
      },
    };
  }
});
