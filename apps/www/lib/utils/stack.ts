import { env } from "@/lib/utils/www-env";
import { StackServerApp as StackServerAppJs } from "@stackframe/js";
import { StackServerApp } from "@stackframe/stack";

export const stackServerApp = new StackServerApp({
  projectId: env.NEXT_PUBLIC_STACK_PROJECT_ID,
  publishableClientKey: env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY,
  secretServerKey: env.STACK_SECRET_SERVER_KEY,
  tokenStore: "nextjs-cookie",
  urls: {
    afterSignIn: "/handler/after-sign-in",
    afterSignUp: "/handler/after-sign-in",
  },
  // Request GitHub 'project' scope for user-owned Projects v2 access
  // GitHub Apps cannot access user Projects v2 - requires OAuth with this scope
  oauthScopesOnSignIn: {
    github: ["project"],
  },
});

export const stackServerAppJs = new StackServerAppJs({
  projectId: env.NEXT_PUBLIC_STACK_PROJECT_ID,
  publishableClientKey: env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY,
  secretServerKey: env.STACK_SECRET_SERVER_KEY,
  tokenStore: "cookie",
});
