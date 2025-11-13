import { StackServerApp as StackServerAppJs } from "@stackframe/js";
import { env } from "./server-env";

export const stackServerApp = new StackServerAppJs({
  projectId: env.NEXT_PUBLIC_STACK_PROJECT_ID,
  publishableClientKey: env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY,
  secretServerKey: env.STACK_SECRET_SERVER_KEY,
  tokenStore: "memory",
});
