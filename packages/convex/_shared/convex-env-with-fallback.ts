import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Convex environment configuration with graceful error handling
 */

const envConfig = {
  server: {
    STACK_WEBHOOK_SECRET: z.string().optional(),
    // Stack Admin keys
    STACK_SECRET_SERVER_KEY: z.string().optional(),
    STACK_SUPER_SECRET_ADMIN_KEY: z.string().optional(),
    NEXT_PUBLIC_STACK_PROJECT_ID: z.string().optional(),
    NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY: z.string().optional(),
    // GitHub integration
    GITHUB_APP_WEBHOOK_SECRET: z.string().optional(),
    INSTALL_STATE_SECRET: z.string().optional(),
    CMUX_GITHUB_APP_ID: z.string().optional(),
    CMUX_GITHUB_APP_PRIVATE_KEY: z.string().optional(),
    BASE_APP_URL: z.string().optional(),
    CMUX_TASK_RUN_JWT_SECRET: z.string().optional(),
    // API Keys - optional
    OPENAI_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    MORPH_API_KEY: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  onValidationError: (error: z.ZodError) => {
    console.error(
      "[ConvexEnv] Validation error:",
      error.flatten().fieldErrors
    );
  },
} as const;

export const env = createEnv(envConfig);

// Validate and warn about missing variables
const criticalVars = [
  "STACK_WEBHOOK_SECRET",
  "BASE_APP_URL",
  "CMUX_TASK_RUN_JWT_SECRET",
] as const;

const optionalVars = [
  "STACK_SECRET_SERVER_KEY",
  "STACK_SUPER_SECRET_ADMIN_KEY",
  "NEXT_PUBLIC_STACK_PROJECT_ID",
  "NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY",
  "GITHUB_APP_WEBHOOK_SECRET",
  "INSTALL_STATE_SECRET",
  "CMUX_GITHUB_APP_ID",
  "CMUX_GITHUB_APP_PRIVATE_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "MORPH_API_KEY",
] as const;

// Check critical variables
for (const varName of criticalVars) {
  const value = env[varName];
  if (!value || value.length === 0) {
    console.error(
      `[ConvexEnv] CRITICAL: ${varName} is not set. Related functionality will not work.`
    );
  }
}

// Check optional variables with warnings
for (const varName of optionalVars) {
  const value = env[varName];
  if (!value || value.length === 0) {
    console.warn(
      `[ConvexEnv] Warning: ${varName} is not set. Related functionality may be unavailable.`
    );
  }
}
