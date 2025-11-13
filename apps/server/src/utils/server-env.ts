import { normalizeOrigin } from "@cmux/shared";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    // Public origin used across the app; prefer this for WWW base URL
    NEXT_PUBLIC_WWW_ORIGIN: z.string().min(1).optional(),
    NEXT_PUBLIC_CONVEX_URL: z.string().min(1),
    NEXT_PUBLIC_STACK_PROJECT_ID: z.string().min(1),
    NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY: z.string().min(1),
  },
  // Handle both Node and Vite/Bun
  runtimeEnv: { ...import.meta.env, ...process.env },
  emptyStringAsUndefined: true,
});

export function getWwwBaseUrl(): string {
  // Read from live process.env first to support tests that mutate env at runtime
  const rawOrigin =
    // Prefer the public origin for the WWW app when available
    process.env.NEXT_PUBLIC_WWW_ORIGIN ||
    env.NEXT_PUBLIC_WWW_ORIGIN ||
    "http://localhost:9779";
  return normalizeOrigin(rawOrigin);
}

export function getStackOAuthConfig(): {
  projectId: string;
  publishableClientKey: string;
} {
  const projectId =
    process.env.NEXT_PUBLIC_STACK_PROJECT_ID ||
    env.NEXT_PUBLIC_STACK_PROJECT_ID;
  const publishableClientKey =
    process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY ||
    env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY;

  if (!projectId || !publishableClientKey) {
    throw new Error(
      "Stack OAuth configuration is missing NEXT_PUBLIC_STACK_PROJECT_ID or NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY"
    );
  }

  return { projectId, publishableClientKey };
}
