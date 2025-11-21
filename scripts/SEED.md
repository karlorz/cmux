# Seeding Stack Auth Data to Convex

This document explains how to seed your Convex database with users and teams from Stack Auth.

## Overview

The seed script (`scripts/seed-stack-auth.ts`) pulls all users, teams, and team memberships from Stack Auth and inserts them into your Convex database. This is useful for:

- Initial database setup
- Syncing data after Stack Auth changes
- Development/testing environments
- Recovering from data loss

## Prerequisites

1. **Environment Variables**: Make sure you have the following in your `.env` file:
   - `NEXT_PUBLIC_STACK_PROJECT_ID` - Your Stack Auth project ID
   - `NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY` - Stack Auth publishable key
   - `STACK_SECRET_SERVER_KEY` - Stack Auth secret server key
   - `STACK_SUPER_SECRET_ADMIN_KEY` - Stack Auth super secret admin key (required for listing all users/teams)
   - `CONVEX_URL` - Your Convex deployment URL (e.g., `https://your-deployment.convex.cloud`)
   - `CONVEX_DEPLOY_KEY` - Your Convex deployment key for admin access

2. **Convex Deployment Key**: Get this from your Convex dashboard under Settings > Deploy Keys

## Usage

### Basic Usage

```bash
bun scripts/seed-stack-auth.ts
```

This will:
- Fetch all users from Stack Auth and insert/update them in Convex
- Fetch all teams from Stack Auth and insert/update them in Convex
- Fetch all team memberships and insert/update them in Convex

### Advanced Options

Control what gets seeded using environment variables:

```bash
# Only seed users (skip teams and memberships)
SEED_TEAMS=false SEED_MEMBERSHIPS=false bun scripts/seed-stack-auth.ts

# Only seed teams (skip users and memberships)
SEED_USERS=false SEED_MEMBERSHIPS=false bun scripts/seed-stack-auth.ts

# Dry run (see what would be synced without writing to database)
SEED_DRY_RUN=true bun scripts/seed-stack-auth.ts

# Include anonymous users
SEED_INCLUDE_ANONYMOUS=true bun scripts/seed-stack-auth.ts

# Custom page size (default: 200, max: 500)
SEED_PAGE_SIZE=100 bun scripts/seed-stack-auth.ts

# Combine options
SEED_DRY_RUN=true SEED_PAGE_SIZE=50 bun scripts/seed-stack-auth.ts
```

### Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `SEED_USERS` | `true` | Whether to backfill users |
| `SEED_TEAMS` | `true` | Whether to backfill teams |
| `SEED_MEMBERSHIPS` | `true` | Whether to backfill team memberships |
| `SEED_PAGE_SIZE` | `200` | Number of records per page (max: 500) |
| `SEED_INCLUDE_ANONYMOUS` | `false` | Include anonymous users |
| `SEED_DRY_RUN` | `false` | Preview changes without writing to database |

## How It Works

The seed script:

1. Connects to your Convex deployment using admin credentials
2. Calls the `backfillFromStack` action in `packages/convex/convex/backfill.ts`
3. The backfill action:
   - Uses Stack Auth Admin API to list all users (with pagination)
   - Uses Stack Auth Admin API to list all teams
   - For each team, lists all members
   - Upserts users, teams, and memberships into Convex using internal mutations

All operations are **idempotent** - running the script multiple times is safe and will update existing records rather than creating duplicates.

## Troubleshooting

### "CONVEX_URL environment variable is required"

Make sure your `.env` file contains `CONVEX_URL=https://your-deployment.convex.cloud`

### "CONVEX_DEPLOY_KEY environment variable is required"

Get a deploy key from your Convex dashboard:
1. Go to your project dashboard
2. Navigate to Settings > Deploy Keys
3. Copy the deploy key and add it to your `.env` file

### "Missing required env: STACK_SUPER_SECRET_ADMIN_KEY"

The seed script requires admin-level access to list all users and teams. Make sure you have the super secret admin key from Stack Auth in your `.env` file.

## Related Files

- `scripts/seed-stack-auth.ts` - The seed script (this is what you run)
- `packages/convex/convex/backfill.ts` - The Convex action that performs the actual backfill
- `packages/convex/convex/stack.ts` - Mutations for upserting users, teams, and memberships
- `packages/convex/convex/schema.ts` - Database schema definitions
