import { OpenAPIHono } from "@hono/zod-openapi";

export const sandboxesRouter = new OpenAPIHono();

// NOTE: /sandboxes/start moved to sandboxes-routes/start.route.ts
// NOTE: /sandboxes/prewarm moved to sandboxes-routes/start.route.ts
// NOTE: /sandboxes/{id}/setup-providers moved to sandboxes-routes/config.route.ts
// NOTE: /sandboxes/{id}/refresh-github-auth moved to sandboxes-routes/config.route.ts
// NOTE: /sandboxes/{id}/env moved to sandboxes-routes/config.route.ts
// NOTE: /sandboxes/{id}/run-scripts moved to sandboxes-routes/config.route.ts
// NOTE: /sandboxes/{id}/stop moved to sandboxes-routes/lifecycle.route.ts
// NOTE: /sandboxes/{id}/status moved to sandboxes-routes/lifecycle.route.ts
// NOTE: /sandboxes/{id}/publish-devcontainer moved to sandboxes-routes/features.route.ts
// NOTE: /sandboxes/{id}/ssh moved to sandboxes-routes/features.route.ts
// NOTE: /sandboxes/{id}/resume moved to sandboxes-routes/lifecycle.route.ts
// NOTE: /sandboxes/{id}/discover-repos moved to sandboxes-routes/features.route.ts
// NOTE: /sandboxes/{id}/live-diff moved to sandboxes-routes/features.route.ts
