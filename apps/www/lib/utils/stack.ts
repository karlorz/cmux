import { env } from "@/lib/utils/www-env";
import { StackServerApp as StackServerAppJs } from "@stackframe/js";
import { StackServerApp } from "@stackframe/stack";

export const stackServerApp = new StackServerApp({
  projectId: env.NEXT_PUBLIC_STACK_PROJECT_ID,
  publishableClientKey: env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY,
  secretServerKey: env.STACK_SECRET_SERVER_KEY,
  tokenStore: "nextjs-cookie",
  urls: {
    // Stack Auth will preserve query parameters from the sign-in URL
    // and pass them through to the after-sign-in handler.
    // Query params like ?is_electron=true&return_to=/path will be
    // automatically forwarded to the after-sign-in page.
    afterSignIn: "/handler/after-sign-in",
    afterSignUp: "/handler/after-sign-in",
    signIn: "/handler/sign-in",
  },
});

export const stackServerAppJs = new StackServerAppJs({
  projectId: env.NEXT_PUBLIC_STACK_PROJECT_ID,
  publishableClientKey: env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY,
  secretServerKey: env.STACK_SECRET_SERVER_KEY,
  tokenStore: "cookie",
});
