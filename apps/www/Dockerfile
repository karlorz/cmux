# syntax=docker/dockerfile:1

# Multi-stage Dockerfile for cmux www (Next.js API)
# Optimized for Coolify deployment with standalone output

# =============================================================================
# Stage 1: Install dependencies
# =============================================================================
FROM oven/bun:1 AS deps

WORKDIR /app

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files for workspace resolution
COPY package.json bun.lock .npmrc ./
COPY apps/www/package.json ./apps/www/
COPY apps/client/package.json ./apps/client/
COPY apps/server/package.json ./apps/server/
COPY apps/worker/package.json ./apps/worker/
COPY apps/edge-router/package.json ./apps/edge-router/
COPY apps/preview-proxy/package.json ./apps/preview-proxy/
COPY packages/shared/package.json ./packages/shared/
COPY packages/convex/package.json ./packages/convex/
COPY packages/www-openapi-client/package.json ./packages/www-openapi-client/
COPY packages/morphcloud-openapi-client/package.json ./packages/morphcloud-openapi-client/
COPY packages/cmux/package.json ./packages/cmux/
COPY packages/vscode-extension/package.json ./packages/vscode-extension/
COPY packages/host-screenshot-collector/package.json ./packages/host-screenshot-collector/
COPY packages/e2b-client/package.json ./packages/e2b-client/
COPY packages/pve-lxc-client/package.json ./packages/pve-lxc-client/
COPY scripts/package.json ./scripts/

# Install all dependencies (need devDependencies for build)
ENV BUN_FROZEN_LOCKFILE=false
RUN rm -f bun.lock && bun install --ignore-scripts

# =============================================================================
# Stage 2: Build the application
# =============================================================================
FROM oven/bun:1 AS builder

WORKDIR /app

# Install Node.js for Next.js build (Next.js requires Node)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy workspace packages source code
COPY packages/shared ./packages/shared
COPY packages/convex ./packages/convex
COPY packages/www-openapi-client ./packages/www-openapi-client
COPY packages/pve-lxc-client ./packages/pve-lxc-client

# Copy www source code
COPY apps/www ./apps/www

# Copy root config files
COPY package.json bun.lock .npmrc tsconfig.json tsconfig.base.json ./

# Re-hydrate dependencies against the full source tree. The manifest-only
# install from the deps stage is not enough for Bun 1.3.11 to resolve the
# nested apps/www workspace graph during generate-openapi-client in CI.
RUN bun install --ignore-scripts --frozen-lockfile

# Re-link @cmux workspace packages to local source and expose the
# workspace-root node_modules to apps/www so Bun can resolve build-time
# packages during generate-openapi-client inside Docker.
RUN rm -rf node_modules/@cmux && mkdir -p node_modules/@cmux \
    && ln -s ../../packages/shared node_modules/@cmux/shared \
    && ln -s ../../packages/convex node_modules/@cmux/convex \
    && ln -s ../../packages/www-openapi-client node_modules/@cmux/www-openapi-client \
    && ln -s ../../packages/pve-lxc-client node_modules/@cmux/pve-lxc-client \
    && rm -rf apps/www/node_modules \
    && ln -s ../../node_modules apps/www/node_modules

# Build arguments for environment variables (needed at build time)
ARG NEXT_PUBLIC_CONVEX_URL
ARG NEXT_PUBLIC_STACK_PROJECT_ID
ARG NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY
ARG NEXT_PUBLIC_GITHUB_APP_SLUG
ARG NEXT_PUBLIC_WWW_ORIGIN
ARG NEXT_PUBLIC_CLIENT_ORIGIN
ARG SENTRY_AUTH_TOKEN

# Set environment variables for the build
ENV NEXT_PUBLIC_CONVEX_URL=$NEXT_PUBLIC_CONVEX_URL
ENV NEXT_PUBLIC_STACK_PROJECT_ID=$NEXT_PUBLIC_STACK_PROJECT_ID
ENV NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY=$NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY
ENV NEXT_PUBLIC_GITHUB_APP_SLUG=$NEXT_PUBLIC_GITHUB_APP_SLUG
ENV NEXT_PUBLIC_WWW_ORIGIN=$NEXT_PUBLIC_WWW_ORIGIN
ENV NEXT_PUBLIC_CLIENT_ORIGIN=$NEXT_PUBLIC_CLIENT_ORIGIN
ENV SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN

# Build the Next.js app with standalone output
WORKDIR /app/apps/www
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# =============================================================================
# Stage 3: Production
# =============================================================================
FROM node:22-slim AS production

WORKDIR /app

# Install minimal runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd --gid 1001 cmux \
    && useradd --uid 1001 --gid cmux --shell /bin/bash --create-home cmux

# Copy standalone build from builder
COPY --from=builder /app/apps/www/.next/standalone ./
COPY --from=builder /app/apps/www/.next/static ./apps/www/.next/static
COPY --from=builder /app/apps/www/public ./apps/www/public

# Set ownership to non-root user
RUN chown -R cmux:cmux /app

USER cmux

ENV NODE_ENV=production
ENV PORT=9779
ENV HOSTNAME=0.0.0.0

EXPOSE 9779

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:9779/api/health || exit 1

CMD ["node", "apps/www/server.js"]
