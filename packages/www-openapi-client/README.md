# @cmux/www-openapi-client

Auto-generated TypeScript client for the cmux WWW API.

## Overview

This package provides type-safe API bindings for the cmux web application's Hono backend (`apps/www`).

## Generation

This client is auto-generated from the OpenAPI specification produced by the Hono app. The generator runs automatically when the dev server is running.

```bash
# Manual regeneration
cd apps/www
bun run generate-openapi-client
```

## Usage

```typescript
import { createClient } from "@cmux/www-openapi-client";

const client = createClient({
  baseUrl: process.env.NEXT_PUBLIC_WWW_ORIGIN,
});

// Example: Create a task
const task = await client.POST("/api/tasks", {
  body: { prompt: "Fix the bug", repo: "owner/repo" },
});
```

## API Coverage

The client provides typed bindings for:

- Task management (create, list, status)
- GitHub integration (repos, PRs, projects)
- Vault operations (notes, search)
- User settings and preferences

## Development Notes

- The client types are generated from Zod schemas in `apps/www/lib/routes/`
- Changes to API routes require dev server restart to regenerate
- Type exports are available at `@cmux/www-openapi-client/types`

## Related

- `apps/www/lib/hono-app.ts` - Hono app definition
- `apps/www/lib/routes/` - API route handlers
- `apps/client/` - React frontend that uses this client
