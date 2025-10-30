import { getConvexProvidersConfig } from "@stackframe/stack";
import { env } from "../_shared/convex-env";

export default {
  providers: getConvexProvidersConfig({
    projectId: env.NEXT_PUBLIC_STACK_PROJECT_ID ?? "",
  }),
};
