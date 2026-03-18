# global-proxy

Rust-based reverse proxy for cmux sandbox routing.

## Overview

A high-performance reverse proxy written in Rust that routes requests to sandbox instances across multiple providers. Designed for deployment on Google Cloud Run.

## Features

- **Multi-Provider Routing**: Routes to Morph, E2B, and PVE-LXC backends
- **WebSocket Support**: Full WebSocket proxying for terminals
- **Auto-Scaling**: Scales automatically on Cloud Run
- **Zero Downtime**: Rolling deployments with health checks

## Development

```bash
cd apps/global-proxy
cargo build
cargo test
cargo run
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Listen port (injected by Cloud Run) |
| `GLOBAL_PROXY_BACKEND_SCHEME` | Backend scheme (`https`) |
| `GLOBAL_PROXY_MORPH_DOMAIN_SUFFIX` | Morph domain suffix |
| `GLOBAL_PROXY_WORKSPACE_DOMAIN_SUFFIX` | Workspace domain suffix |

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for Cloud Run deployment instructions.

```bash
# Build and push
docker build -t REGION-docker.pkg.dev/PROJECT/cmux/global-proxy:TAG .
docker push REGION-docker.pkg.dev/PROJECT/cmux/global-proxy:TAG

# Deploy to Cloud Run
gcloud run deploy global-proxy --image=IMAGE_URL
```

## Architecture

```
Request → global-proxy → Provider Backend
              ↓
         Route by subdomain pattern:
         - *.morph.so → Morph Cloud
         - *.e2b.dev → E2B
         - *.alphasolves.com → PVE-LXC
```

## Related

- `apps/edge-router/` - Cloudflare Worker router (Morph)
- `apps/edge-router-pvelxc/` - Cloudflare Worker router (PVE-LXC)
