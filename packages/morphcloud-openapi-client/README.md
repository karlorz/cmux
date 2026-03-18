# @cmux/morphcloud-openapi-client

Auto-generated TypeScript client for the Morph Cloud API.

## Overview

This package provides type-safe API bindings for [Morph Cloud](https://morphvm.cloud), a cloud VM provider used by cmux for sandbox provisioning.

## Generation

This client is auto-generated from the Morph Cloud OpenAPI specification using `@hey-api/openapi-ts`.

```bash
# Regenerate client (if spec changes)
cd packages/morphcloud-openapi-client
bun run generate
```

## Usage

```typescript
import { createClient } from "@cmux/morphcloud-openapi-client";

const client = createClient({
  baseUrl: "https://api.morphvm.cloud",
  headers: {
    Authorization: `Bearer ${process.env.MORPH_API_KEY}`,
  },
});

// Create a VM instance
const instance = await client.POST("/instances", {
  body: { snapshotId: "snapshot_abc123" },
});
```

## API Coverage

The client provides typed bindings for:

- Instance lifecycle (create, start, stop, delete)
- Snapshot management
- Command execution
- HTTP service exposure

## Related

- `apps/server/src/providers/morph.ts` - Morph provider implementation
- `packages/shared/src/provider-types.ts` - Provider interface types
