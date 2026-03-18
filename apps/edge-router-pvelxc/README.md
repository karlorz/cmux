# edge-router-pvelxc

Cloudflare Worker edge router for cmux PVE-LXC sandboxes.

## Overview

This is a Cloudflare Worker that routes requests to self-hosted PVE-LXC sandbox instances. It's a fork of `edge-router` adapted for Proxmox VE containers.

## Deployment

```bash
cd apps/edge-router-pvelxc
bun run deploy
```

Deploys to Cloudflare Workers via Wrangler. Routes to `*.alphasolves.com`.

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `PVE_API_URL` | Proxmox VE API endpoint |
| `PVE_API_TOKEN` | API token for authentication |

## Routes

| Pattern | Target |
|---------|--------|
| `<id>.alphasolves.com/*` | PVE-LXC container HTTP |
| `<id>.alphasolves.com/ws/*` | PVE-LXC container WebSocket |

## Differences from edge-router

- Routes to PVE-LXC containers instead of Morph VMs
- Uses Cloudflare Tunnel for connectivity
- Deployed to `alphasolves.com` domain

## Related

- `apps/edge-router/` - Morph Cloud variant
- `packages/pve-lxc-client/` - PVE-LXC API client
