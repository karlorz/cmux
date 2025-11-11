import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Environment configuration with graceful error handling
 */

const envConfig = {
  clientPrefix: "NEXT_PUBLIC_",
  server: {
    // Stack server-side env - critical for auth
    STACK_SECRET_SERVER_KEY: z.string().optional(),
    STACK_SUPER_SECRET_ADMIN_KEY: z.string().optional(),
    STACK_DATA_VAULT_SECRET: z.string().optional(),
    // GitHub App
    CMUX_GITHUB_APP_ID: z.string().optional(),
    CMUX_GITHUB_APP_PRIVATE_KEY: z.string().optional(),
    // Morph
    MORPH_API_KEY: z.string().optional(),
    CONVEX_DEPLOY_KEY: z.string().optional(),
    // JWT Secret
    CMUX_TASK_RUN_JWT_SECRET: z.string().optional(),
    // API Keys - optional
    OPENAI_API_KEY: z.string().optional(),
    GEMINI_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_STACK_PROJECT_ID: z.string().optional(),
    NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY: z.string().optional(),
    NEXT_PUBLIC_CONVEX_URL: z.string().optional(),
    NEXT_PUBLIC_GITHUB_APP_SLUG: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  onValidationError: (error: z.ZodError) => {
    console.error("[EnvConfig] Validation error:", error.flatten().fieldErrors);
  },
} as const;

export const env = createEnv(envConfig);

// Validate and warn about missing variables
const criticalServerVars = [
  "STACK_SECRET_SERVER_KEY",
  "STACK_SUPER_SECRET_ADMIN_KEY",
  "STACK_DATA_VAULT_SECRET",
  "CMUX_GITHUB_APP_ID",
  "CMUX_GITHUB_APP_PRIVATE_KEY",
  "MORPH_API_KEY",
  "CONVEX_DEPLOY_KEY",
  "CMUX_TASK_RUN_JWT_SECRET",
] as const;

const criticalClientVars = [
  "NEXT_PUBLIC_STACK_PROJECT_ID",
  "NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY",
  "NEXT_PUBLIC_CONVEX_URL",
] as const;

const optionalVars = [
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "ANTHROPIC_API_KEY",
  "NEXT_PUBLIC_GITHUB_APP_SLUG",
] as const;

// Check critical variables
for (const varName of criticalServerVars) {
  const value = env[varName];
  if (!value || value.length === 0) {
    console.error(
      `[EnvConfig] CRITICAL: ${varName} is not set. Related functionality will not work.`
    );
  }
}

for (const varName of criticalClientVars) {
  const value = env[varName];
  if (!value || value.length === 0) {
    console.error(
      `[EnvConfig] CRITICAL: ${varName} is not set. Related functionality will not work.`
    );
  }
}

// Check optional variables with warnings
for (const varName of optionalVars) {
  const value = env[varName];
  if (!value || value.length === 0) {
    console.warn(
      `[EnvConfig] Warning: ${varName} is not set. Related functionality may be unavailable.`
    );
  }
}

// Special check for STACK_DATA_VAULT_SECRET length
if (
  env.STACK_DATA_VAULT_SECRET &&
  env.STACK_DATA_VAULT_SECRET.length < 32
) {
  console.error(
    `[EnvConfig] CRITICAL: STACK_DATA_VAULT_SECRET must be at least 32 characters. Current length: ${env.STACK_DATA_VAULT_SECRET.length}`
  );
}

/**
 * Check if a critical environment variable is configured
 */
export function isCriticalEnvConfigured(key: keyof typeof env): boolean {
  try {
    const value = env[key];
    return typeof value === "string" && value.length > 0;
  } catch {
    return false;
  }
}

/**
 * Get environment readiness status
 */
export interface EnvHealthStatus {
  isHealthy: boolean;
  criticalIssues: string[];
  warnings: string[];
}

export function getEnvHealthStatus(): EnvHealthStatus {
  const criticalIssues: string[] = [];
  const warnings: string[] = [];

  // Check critical server-side variables
  for (const varName of criticalServerVars) {
    if (!isCriticalEnvConfigured(varName)) {
      criticalIssues.push(`${varName} is not configured`);
    }
  }

  // Check critical client-side variables
  for (const varName of criticalClientVars) {
    if (!isCriticalEnvConfigured(varName)) {
      criticalIssues.push(`${varName} is not configured`);
    }
  }

  // Check optional variables
  for (const varName of optionalVars) {
    if (!isCriticalEnvConfigured(varName)) {
      warnings.push(`${varName} is not configured (optional)`);
    }
  }

  // Check STACK_DATA_VAULT_SECRET length
  if (
    env.STACK_DATA_VAULT_SECRET &&
    env.STACK_DATA_VAULT_SECRET.length < 32
  ) {
    criticalIssues.push("STACK_DATA_VAULT_SECRET is too short (< 32 chars)");
  }

  return {
    isHealthy: criticalIssues.length === 0,
    criticalIssues,
    warnings,
  };
}
