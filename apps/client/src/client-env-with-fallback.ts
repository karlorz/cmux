import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Client environment configuration with graceful error handling
 */

const envConfig = {
  server: {},
  clientPrefix: "NEXT_PUBLIC_",
  client: {
    NEXT_PUBLIC_CONVEX_URL: z.string().optional(),
    NEXT_PUBLIC_STACK_PROJECT_ID: z.string().optional(),
    NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY: z.string().optional(),
    NEXT_PUBLIC_GITHUB_APP_SLUG: z.string().optional(),
    NEXT_PUBLIC_WWW_ORIGIN: z.string().optional(),
    NEXT_PUBLIC_SERVER_ORIGIN: z.string().optional(),
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
  onValidationError: (error: z.ZodError) => {
    console.error(
      "[ClientEnv] Validation error:",
      error.flatten().fieldErrors
    );
  },
} as const;

export const env = createEnv(envConfig);

// Validate and warn about missing variables
const criticalVars = [
  "NEXT_PUBLIC_CONVEX_URL",
  "NEXT_PUBLIC_STACK_PROJECT_ID",
  "NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY",
  "NEXT_PUBLIC_WWW_ORIGIN",
] as const;

const optionalVars = [
  "NEXT_PUBLIC_GITHUB_APP_SLUG",
  "NEXT_PUBLIC_SERVER_ORIGIN",
] as const;

// Check critical variables
for (const varName of criticalVars) {
  const value = env[varName];
  if (!value || value.length === 0) {
    console.error(
      `[ClientEnv] CRITICAL: ${varName} is not set. Related functionality will not work.`
    );
  }
}

// Check optional variables with warnings
for (const varName of optionalVars) {
  const value = env[varName];
  if (!value || value.length === 0) {
    console.warn(
      `[ClientEnv] Warning: ${varName} is not set. Related functionality may be unavailable.`
    );
  }
}

/**
 * Check if Stack Auth is properly configured
 */
export function isStackAuthConfigured(): boolean {
  try {
    return !!(
      env.NEXT_PUBLIC_STACK_PROJECT_ID &&
      env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY &&
      env.NEXT_PUBLIC_STACK_PROJECT_ID.length > 0 &&
      env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY.length > 0
    );
  } catch {
    return false;
  }
}

/**
 * Check if Convex is properly configured
 */
export function isConvexConfigured(): boolean {
  try {
    return !!(
      env.NEXT_PUBLIC_CONVEX_URL && env.NEXT_PUBLIC_CONVEX_URL.length > 0
    );
  } catch {
    return false;
  }
}
