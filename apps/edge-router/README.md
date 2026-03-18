# edge-router

Cloudflare Worker edge router for cmux Morph sandboxes.

## Overview

This is a Cloudflare Worker that routes requests to Morph Cloud sandbox instances. It handles:

- **Subdomain Routing**: Routes `<sandbox-id>.cmux.sh` to the correct instance
- **WebSocket Proxying**: Terminal and real-time connections
- **Health Checks**: Instance availability monitoring

## Deployment

```bash
cd apps/edge-router
bun run deploy
```

Deploys to Cloudflare Workers via Wrangler.

## Configuration

### wrangler.toml

```toml
name = "cmux-edge-router"
main = "src/index.ts"

[vars]
MORPH_API_URL = "https://api.morphvm.cloud"
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `MORPH_API_KEY` | Morph Cloud API key (secret) |

## Routes

| Pattern | Target |
|---------|--------|
| `<id>.cmux.sh/*` | Morph instance HTTP |
| `<id>.cmux.sh/ws/*` | Morph instance WebSocket |

## Related

- `apps/edge-router-pvelxc/` - PVE-LXC variant
- `packages/morphcloud-openapi-client/` - Morph API client
