import { env } from "@/lib/utils/www-env";
import { StackServerApp as StackServerAppJs } from "@stackframe/js";
import { StackServerApp } from "@stackframe/stack";

/**
 * Create Stack Auth instances with error handling
 * Returns null if initialization fails instead of throwing
 */
function createStackServerApp(): StackServerApp | null {
  try {
    return new StackServerApp({
      projectId: env.NEXT_PUBLIC_STACK_PROJECT_ID,
      publishableClientKey: env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY,
      secretServerKey: env.STACK_SECRET_SERVER_KEY,
      tokenStore: "nextjs-cookie",
      urls: {
        afterSignIn: "/handler/after-sign-in",
        afterSignUp: "/handler/after-sign-in",
      },
    });
  } catch (error) {
    console.error("[Stack Auth] Failed to initialize StackServerApp:", error);
    return null;
  }
}

function createStackServerAppJs(): StackServerAppJs | null {
  try {
    return new StackServerAppJs({
      projectId: env.NEXT_PUBLIC_STACK_PROJECT_ID,
      publishableClientKey: env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY,
      secretServerKey: env.STACK_SECRET_SERVER_KEY,
      tokenStore: "cookie",
    });
  } catch (error) {
    console.error(
      "[Stack Auth] Failed to initialize StackServerAppJs:",
      error
    );
    return null;
  }
}

export const stackServerApp = createStackServerApp();
export const stackServerAppJs = createStackServerAppJs();

/**
 * Check if Stack Auth is available
 */
export function isStackAuthAvailable(): boolean {
  return stackServerApp !== null && stackServerAppJs !== null;
}

/**
 * Get StackServerApp instance or throw if unavailable
 */
export function requireStackServerApp(): StackServerApp {
  if (!stackServerApp) {
    throw new Error(
      "Stack Auth is not available. Please check your configuration."
    );
  }
  return stackServerApp;
}

/**
 * Get StackServerAppJs instance or throw if unavailable
 */
export function requireStackServerAppJs(): StackServerAppJs {
  if (!stackServerAppJs) {
    throw new Error(
      "Stack Auth is not available. Please check your configuration."
    );
  }
  return stackServerAppJs;
}
