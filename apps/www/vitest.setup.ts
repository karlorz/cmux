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

// Check if we have real Stack Auth credentials
const hasRealStackCreds =
  process.env.NEXT_PUBLIC_STACK_PROJECT_ID &&
  process.env.NEXT_PUBLIC_STACK_PROJECT_ID.match(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  );

// Mock Stack Auth module if we don't have real credentials
// This prevents StackServerApp from validating the project ID at import time
if (!hasRealStackCreds) {
  vi.mock("./lib/utils/stack", () => ({
    stackServerApp: {
      getUser: vi.fn().mockResolvedValue(null),
      useUser: vi.fn().mockReturnValue(null),
    },
    stackServerAppJs: {
      getUser: vi.fn().mockResolvedValue(null),
    },
  }));

  // Mock the test token helper since it also instantiates StackAdminApp
  // Tests using this helper will fail, indicating they need real credentials
  // The test files should use describe.skipIf(!hasStackCreds) for these tests
  vi.mock("./lib/test-utils/__TEST_INTERNAL_ONLY_GET_STACK_TOKENS", () => ({
    __TEST_INTERNAL_ONLY_GET_STACK_TOKENS: vi.fn().mockImplementation(async () => {
      // Return mock tokens that will fail auth but allow tests to run
      return { accessToken: "mock-access-token-for-testing" };
    }),
  }));
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
