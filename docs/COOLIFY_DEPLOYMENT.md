# Coolify Deployment Guide

Deploy cmux web services to Coolify using pre-built Docker images.

## Quick Start

1. **Copy environment file:**
   ```bash
   cp .env.coolify.example .env.coolify
   # Edit .env.coolify with your values
   ```

2. **Deploy via Coolify UI:**
   - Create new Docker Compose application
   - Point to `docker-compose.coolify.yml`
   - Add environment variables from `.env.coolify`
   - Deploy

3. **Validate deployment:**
   ```bash
   ./scripts/validate-coolify-deployment.sh \
     --client-url https://cmux.karldigi.dev \
     --www-url https://cmux-www.karldigi.dev \
     --server-url https://cmux-server.karldigi.dev
   ```

## Services

| Service | Port | Image | Health Check |
|---------|------|-------|--------------|
| cmux-client | 8080 | ghcr.io/karlorz/cmux-client | `/health` |
| cmux-www | 9779 | ghcr.io/karlorz/cmux-www | `/api/health` |
| cmux-server | 9776 | ghcr.io/karlorz/cmux-server | TCP connect |

## Required Environment Variables

### All Services
- `NEXT_PUBLIC_CONVEX_URL` - Convex deployment URL
- `CMUX_TASK_RUN_JWT_SECRET` - Shared JWT secret (min 32 chars)

### cmux-www (API)
- `NEXT_PUBLIC_STACK_PROJECT_ID` - Stack Auth project ID
- `NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY` - Stack Auth public key
- `STACK_SECRET_SERVER_KEY` - Stack Auth server key
- `NEXT_PUBLIC_WWW_ORIGIN` - WWW app origin (e.g., https://cmux-www.karldigi.dev)
- `NEXT_PUBLIC_CLIENT_ORIGIN` - Client app origin (e.g., https://cmux.karldigi.dev)

### cmux-server (WebSocket)
- `CMUX_ALLOWED_SOCKET_ORIGINS` - Comma-separated CORS origins

## Feature Enablement

### Phase 1: PR Comment → Agent
No env var needed. Requires GitHub App configuration:
1. Go to GitHub App settings
2. Enable `issue_comment` webhook event
3. Users can now mention `@cmux` in PR comments

### Phase 2: Operator Visual Verification
```bash
CMUX_ENABLE_OPERATOR_VERIFICATION=true
```
Enables automatic screenshots after task completion.

## Image Tags

Images are built by GitHub Actions and pushed to GHCR:
- `:latest` - Latest main branch
- `:sha-<commit>` - Specific commit
- `:v1.0.x` - Release tags

Override in Coolify:
```yaml
CLIENT_IMAGE=ghcr.io/karlorz/cmux-client:v1.0.270
WWW_IMAGE=ghcr.io/karlorz/cmux-www:v1.0.270
SERVER_IMAGE=ghcr.io/karlorz/cmux-server:v1.0.270
```

## Troubleshooting

### Health check fails
```bash
# Check individual service
curl -v https://cmux.karldigi.dev/health
curl -v https://cmux-www.karldigi.dev/api/health
```

### WebSocket connection fails
Verify `CMUX_ALLOWED_SOCKET_ORIGINS` includes your client domain.

### Convex errors
Verify `NEXT_PUBLIC_CONVEX_URL` is correct and Convex deployment is running.
