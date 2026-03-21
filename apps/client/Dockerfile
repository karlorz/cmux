# syntax=docker/dockerfile:1

# Multi-stage Dockerfile for cmux client (Vite SPA)
# Optimized for Coolify deployment

# =============================================================================
# Stage 1: Install dependencies
# =============================================================================
FROM oven/bun:1 AS deps

WORKDIR /app

# Copy package files for workspace resolution
COPY package.json bun.lock .npmrc ./
COPY apps/client/package.json ./apps/client/
COPY apps/edge-router-pvelxc/package.json ./apps/edge-router-pvelxc/
COPY apps/edge-router/package.json ./apps/edge-router/
COPY apps/preview-proxy/package.json ./apps/preview-proxy/
COPY apps/server/package.json ./apps/server/
COPY apps/worker/package.json ./apps/worker/
COPY apps/www/package.json ./apps/www/
COPY packages/cmux/package.json ./packages/cmux/
COPY packages/convex/package.json ./packages/convex/
COPY packages/devsh-memory-mcp/package.json ./packages/devsh-memory-mcp/
COPY packages/e2b-client/package.json ./packages/e2b-client/
COPY packages/host-screenshot-collector/package.json ./packages/host-screenshot-collector/
COPY packages/morphcloud-openapi-client/package.json ./packages/morphcloud-openapi-client/
COPY packages/pr-heatmap/package.json ./packages/pr-heatmap/
COPY packages/pve-lxc-client/package.json ./packages/pve-lxc-client/
COPY packages/pve-vm-client/package.json ./packages/pve-vm-client/
COPY packages/shared/package.json ./packages/shared/
COPY packages/vscode-extension/package.json ./packages/vscode-extension/
COPY packages/www-openapi-client/package.json ./packages/www-openapi-client/
COPY scripts/package.json ./scripts/

# Install all dependencies (need devDependencies for build)
RUN bun install --ignore-scripts --frozen-lockfile

# =============================================================================
# Stage 2: Build the application
# =============================================================================
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy workspace packages source code
COPY packages/shared ./packages/shared
COPY packages/convex ./packages/convex
COPY packages/www-openapi-client ./packages/www-openapi-client

# Copy client source code
COPY apps/client ./apps/client

# Copy root config files
COPY package.json bun.lock .npmrc tsconfig.json tsconfig.base.json ./

# Build arguments for environment variables (injected at build time)
ARG NEXT_PUBLIC_CONVEX_URL
ARG NEXT_PUBLIC_STACK_PROJECT_ID
ARG NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY
ARG NEXT_PUBLIC_GITHUB_APP_SLUG
ARG NEXT_PUBLIC_WWW_ORIGIN
ARG NEXT_PUBLIC_SERVER_ORIGIN
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_CMUX_PROTOCOL
ARG NEXT_PUBLIC_WEB_MODE
ARG NEXT_PUBLIC_SENTRY_WEB_DSN
ARG SENTRY_AUTH_TOKEN

# Set environment variables for the build
ENV NEXT_PUBLIC_CONVEX_URL=$NEXT_PUBLIC_CONVEX_URL
ENV NEXT_PUBLIC_STACK_PROJECT_ID=$NEXT_PUBLIC_STACK_PROJECT_ID
ENV NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY=$NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY
ENV NEXT_PUBLIC_GITHUB_APP_SLUG=$NEXT_PUBLIC_GITHUB_APP_SLUG
ENV NEXT_PUBLIC_WWW_ORIGIN=$NEXT_PUBLIC_WWW_ORIGIN
ENV NEXT_PUBLIC_SERVER_ORIGIN=$NEXT_PUBLIC_SERVER_ORIGIN
ENV NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST
ENV NEXT_PUBLIC_CMUX_PROTOCOL=$NEXT_PUBLIC_CMUX_PROTOCOL
ENV NEXT_PUBLIC_WEB_MODE=$NEXT_PUBLIC_WEB_MODE
ENV NEXT_PUBLIC_SENTRY_WEB_DSN=$NEXT_PUBLIC_SENTRY_WEB_DSN
ENV SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN

# Build the Vite SPA
WORKDIR /app/apps/client
RUN bun run build

# =============================================================================
# Stage 3: Production with nginx
# =============================================================================
FROM nginx:1.27-alpine AS production

# Install curl for healthcheck
RUN apk add --no-cache curl

# Create non-root user for security
RUN addgroup -g 1001 cmux \
    && adduser -u 1001 -G cmux -s /bin/sh -D cmux

# Copy nginx config
COPY apps/client/nginx.conf /etc/nginx/nginx.conf

# Copy built assets from builder stage
COPY --from=builder /app/apps/client/dist /usr/share/nginx/html

# Set ownership
RUN chown -R cmux:cmux /usr/share/nginx/html \
    && chown -R cmux:cmux /var/cache/nginx \
    && chown -R cmux:cmux /var/log/nginx \
    && touch /var/run/nginx.pid \
    && chown -R cmux:cmux /var/run/nginx.pid

USER cmux

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
