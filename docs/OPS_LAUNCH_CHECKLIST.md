# cmux Launch OPS Checklist

> **Status**: All code implementation complete. Only OPS configuration remains.
> **Last Updated**: 2026-03-23

## Overview

This checklist covers the infrastructure configuration required to launch the Q2 2026 features:
- **Phase 1**: PR Comment → Agent
- **Phase 2**: Operator Visual Verification
- **Deployment**: Vercel/Coolify production setup

---

## Phase 1: PR Comment → Agent

### GitHub App Webhook Configuration

**Goal**: Enable `@cmux` mentions in PR comments to trigger coding agents.

#### Steps

1. **Open GitHub App Settings**
   - Production: https://github.com/settings/apps/cmux-app (or your app name)
   - Development: https://github.com/settings/apps/cmux-local-dev

2. **Navigate to Webhooks → Subscribe to events**

3. **Enable Required Events**
   - [ ] `Issue comments` - for PR/issue comment mentions
   - [ ] `Pull request review comments` - for inline review comment mentions

4. **Verify Webhook URL**
   - Self-hosted: `https://<your-convex-deployment>.convex.site/github_webhook`
   - Cloud: `https://<deployment-id>.convex.site/github_webhook`

5. **Save Changes**

#### Environment Variables (Already Set)

Verify these are configured in your Convex deployment:

```bash
# Check with:
bunx convex env ls --env-file .env | grep -E "GITHUB_APP|CMUX_GITHUB"
```

| Variable | Purpose |
|----------|---------|
| `GITHUB_APP_WEBHOOK_SECRET` | Webhook signature verification |
| `CMUX_GITHUB_APP_ID` | GitHub App ID |
| `CMUX_GITHUB_APP_PRIVATE_KEY` | GitHub App private key (PEM) |

#### Verification Test

```bash
# On a PR in a repo with the GitHub App installed:
# 1. Comment: @cmux echo hello world
# 2. Expected: 👀 reaction added immediately
# 3. Expected: Task created in dashboard
# 4. Expected: Agent runs, posts result comment
# 5. Expected: 🚀 reaction added on completion
```

---

## Phase 2: Operator Visual Verification

### Enable Screenshot Workflow

**Goal**: Enable automatic screenshots after agent task completion.

#### Steps

1. **Set Environment Variable in Convex**

   ```bash
   # For production:
   bunx convex env set CMUX_ENABLE_OPERATOR_VERIFICATION true --env-file .env.production

   # For development:
   bunx convex env set CMUX_ENABLE_OPERATOR_VERIFICATION true --env-file .env
   ```

2. **Verify Setting**

   ```bash
   bunx convex env ls --env-file .env | grep OPERATOR_VERIFICATION
   ```

#### What This Enables

- Automatic browser screenshots after task runs complete
- Screenshots posted to PR comments
- Visual verification of changes before merge

---

## Deployment: Vercel + Coolify

### Vercel Configuration (Staging/Verification)

**Goal**: Use Vercel for the `staging` branch verification lane only.

#### Steps

1. **Configure Branch Domains in Vercel Dashboard**

   For `apps/client`:
   - [ ] Set production branch to `staging`
   - [ ] Configure domain: `staging-client.karldigi.dev` (or your domain)

   For `apps/www`:
   - [ ] Set production branch to `staging`
   - [ ] Configure domain: `staging-www.karldigi.dev` (or your domain)

2. **Verify vercel.json Configuration**

   Both apps should have:
   ```json
   {
     "git": {
       "deploymentEnabled": {
         "*": false,
         "staging": true
       }
     }
   }
   ```

### Coolify Configuration (Production)

**Goal**: Use Coolify for `main` branch production deployments.

#### Required Environment Variables

Add to Coolify dashboard for `docker-compose.coolify.yml`:

| Variable | Value | Service |
|----------|-------|---------|
| `CMUX_SERVER_URL` | `https://cmux-server.karldigi.dev` | cmux-server |
| `WWW_INTERNAL_URL` | `http://cmux-www:9779` | cmux-server |
| `NEXT_PUBLIC_SERVER_ORIGIN` | `https://cmux-server.karldigi.dev` | cmux-client |
| `NEXT_PUBLIC_WWW_ORIGIN` | `https://cmux-www.karldigi.dev` | cmux-client, cmux-www |

#### Verification

Run deployment validator:

```bash
./scripts/validate-coolify-deployment.sh
```

Expected checks:
- [ ] `cmux-client /health` returns 200
- [ ] `cmux-www /api/health` returns JSON
- [ ] `cmux-server /api/health` returns JSON
- [ ] `cmux-server /socket.io/?EIO=4&transport=polling` returns socket.io response

---

## Quick Reference

### Production Domains (from .env.production)

| Service | Domain |
|---------|--------|
| Client | `https://cmux.karldigi.dev` |
| WWW | `https://cmux-www.karldigi.dev` |
| Server | `https://cmux-server.karldigi.dev` |

### Deployment Flow

```
feature/* → main (Coolify production)
              ↓
           staging (Vercel verification)
```

### Key Files

| File | Purpose |
|------|---------|
| `packages/convex/convex/github_webhook.ts` | PR comment → agent handler |
| `packages/convex/convex/github_pr_comments.ts` | Result posting to PRs |
| `apps/client/vercel.json` | Vercel branch gating |
| `apps/www/vercel.json` | Vercel branch gating |
| `docker-compose.coolify.yml` | Coolify multi-service compose |
| `.env.coolify.example` | Coolify env template |

---

## Completion Checklist

### Phase 1: PR Comment → Agent
- [ ] GitHub App: `issue_comment` event enabled
- [ ] GitHub App: `pull_request_review_comment` event enabled
- [ ] Webhook URL verified
- [ ] End-to-end test passed

### Phase 2: Operator Verification
- [ ] `CMUX_ENABLE_OPERATOR_VERIFICATION=true` set in production

### Deployment
- [ ] Vercel staging domains configured
- [ ] Coolify env vars filled (CMUX_SERVER_URL, WWW_INTERNAL_URL)
- [ ] Deployment validator passes
- [ ] TLS termination verified for all services

---

## Troubleshooting

### Webhook Not Receiving Events

1. Check GitHub App webhook delivery logs
2. Verify webhook secret matches `GITHUB_APP_WEBHOOK_SECRET`
3. Check Convex logs for `[issue_comment]` entries

### Agent Not Triggered

1. Verify comment matches pattern: `@cmux <prompt>` or `@cmux-bot <prompt>`
2. Check team has GitHub App installed on the repository
3. Verify `prCommentTriggerEnabled: true` in `github_webhook.ts`

### Screenshots Not Posted

1. Verify `CMUX_ENABLE_OPERATOR_VERIFICATION=true` is set
2. Check Convex logs for screenshot workflow errors
3. Verify GitHub App has write permissions for PR comments
