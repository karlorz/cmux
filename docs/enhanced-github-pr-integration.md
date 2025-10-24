# Enhanced GitHub Pull Request Integration

This document describes the enhanced GitHub pull request functionality in the cmux project, including improved draft PR creation, better error handling, and extended API capabilities.

## Overview

The enhanced GitHub PR system provides:

1. **Draft PR Support**: Create and manage draft pull requests
2. **Enhanced Error Handling**: Better error messages and recovery
3. **Extended API Operations**: Update PR titles, descriptions, and metadata
4. **Improved Auto-Commit Integration**: Support for draft PRs in automated workflows
5. **Comprehensive PR Management**: Full lifecycle management of pull requests

## API Endpoints

### 1. Create/Open Pull Request

**Endpoint**: `POST /integrations/github/prs/open`

**Enhanced Features**:
- Support for creating draft PRs
- Automatic conversion between draft and ready states
- Better error handling with specific error messages

**Request Body**:
```typescript
{
  teamSlugOrId: string;
  taskRunId: string;
  createAsDraft?: boolean; // New: Create as draft PR
}
```

**Response**:
```typescript
{
  success: boolean;
  results: PullRequestActionResult[];
  aggregate: AggregatePullRequestSummary;
  error?: string;
}
```

### 2. Update Pull Request

**Endpoint**: `POST /integrations/github/prs/update` (New)

**Features**:
- Update PR title and/or body
- Maintain PR state and metadata
- Automatic database synchronization

**Request Body**:
```typescript
{
  teamSlugOrId: string;
  owner: string;
  repo: string;
  number: number;
  title?: string;
  body?: string;
}
```

**Response**:
```typescript
{
  success: boolean;
  message: string;
  pullRequest: {
    number: number;
    title: string;
    body?: string;
    html_url: string;
    state: string;
    draft: boolean;
  };
}
```

### 3. Merge Pull Request

**Endpoint**: `POST /integrations/github/prs/merge`

**Enhanced Features**:
- Automatic draft PR conversion before merge
- Support for different merge methods (squash, rebase, merge)
- Better error handling for merge conflicts

### 4. Close Pull Request

**Endpoint**: `POST /integrations/github/prs/close`

**Features**:
- Proper state management
- Database synchronization
- Error handling for already closed PRs

## Enhanced Error Handling

The system now provides specific error messages for common scenarios:

### Error Types and Messages

| Error Condition | Enhanced Message | Original Message |
|------------------|------------------|------------------|
| No commits between branches | "No changes to commit - branch is identical to base branch" | Generic GitHub error |
| PR already exists | "A pull request for this branch already exists" | Generic GitHub error |
| Branch not found | "Branch not found - please ensure the branch exists" | "404 Not Found" |
| Insufficient permissions | "Insufficient permissions to create pull request" | "403 Forbidden" |
| Invalid PR data | "Invalid pull request data - check branch names and title" | "422 Unprocessable Entity" |

## Auto-Commit Enhancements

The auto-commit system now supports:

### 1. Draft PR Creation

**Workspace Settings**:
```typescript
{
  autoPrEnabled: boolean;     // Enable/disable auto-PR creation
  createDraftPr: boolean;    // Create PRs as drafts (new)
}
```

**Behavior**:
- When `createDraftPr` is `true`, auto-created PRs are marked as draft
- Draft PRs can be converted to ready state later
- Maintains backward compatibility with existing workflows

### 2. Enhanced PR Body Generation

The system generates comprehensive PR bodies for crowned runs:

```markdown
## 🏆 Crown Winner: {agent_name}

### Task Description
{task_text}
{task_description}

### Crown Evaluation
{crown_reason}

### Implementation Details
- **Agent**: {agent_name}
- **Task ID**: {task_id}
- **Run ID**: {task_run_id}
- **Branch**: {branch_name}
- **Completed**: {timestamp}
```

## GitHubPREnhanced Utility Class

A new utility class provides comprehensive PR management capabilities:

### Key Methods

#### 1. `createPullRequest()`
```typescript
async createPullRequest(
  owner: string,
  repo: string,
  title: string,
  head: string,
  base: string,
  body: string,
  options?: GitHubPREnhancedOptions
)
```

**Options**:
```typescript
interface GitHubPREnhancedOptions {
  createAsDraft?: boolean;
  autoConvertDraft?: boolean;
  enableStatusChecks?: boolean;
  assignReviewers?: string[];
  labels?: string[];
  milestone?: number;
}
```

#### 2. `updatePullRequest()`
```typescript
async updatePullRequest(
  owner: string,
  repo: string,
  number: number,
  options: GitHubPRUpdateOptions
)
```

**Update Options**:
```typescript
interface GitHubPRUpdateOptions {
  title?: string;
  body?: string;
  state?: 'open' | 'closed';
  base?: string;
  milestone?: number | null;
  labels?: string[] | null;
  assignees?: string[] | null;
}
```

#### 3. Draft Management
```typescript
// Convert PR to draft
async convertToDraft(owner: string, repo: string, number: number)

// Mark draft PR as ready for review
async markReadyForReview(owner: string, repo: string, number: number)
```

#### 4. Status and Review Management
```typescript
// Get PR status checks
async getStatusChecks(owner: string, repo: string, number: number)

// Add comment to PR
async addComment(owner: string, repo: string, number: number, body: string)

// Request reviewers
async requestReviewers(
  owner: string,
  repo: string,
  number: number,
  reviewers: string[],
  team_reviewers?: string[]
)
```

#### 5. Enhanced Merge
```typescript
async mergePullRequest(
  owner: string,
  repo: string,
  number: number,
  method: 'merge' | 'squash' | 'rebase' = 'merge',
  commitTitle?: string,
  commitMessage?: string,
  options?: {
    sha?: string;
    deleteBranch?: boolean;
  }
)
```

## Database Schema Updates

The existing `pullRequests` table in Convex supports all enhanced features:

### Key Fields
- `state`: PR state ("open", "closed", "draft", "merged")
- `draft`: Boolean indicating if PR is a draft
- `title`: PR title (updatable)
- `htmlUrl`: PR URL
- `number`: PR number
- `mergeCommitSha`: SHA of merge commit (when merged)

### Task Integration
- `tasks.pullRequestTitle`: Custom PR title
- `tasks.pullRequestDescription`: Custom PR description
- `tasks.mergeStatus`: Merge status tracking

## Usage Examples

### 1. Create a Draft PR
```typescript
const response = await fetch('/integrations/github/prs/open', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    teamSlugOrId: 'my-team',
    taskRunId: 'task_run_123',
    createAsDraft: true,
  }),
});
```

### 2. Update PR Title and Body
```typescript
const response = await fetch('/integrations/github/prs/update', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    teamSlugOrId: 'my-team',
    owner: 'myorg',
    repo: 'myrepo',
    number: 42,
    title: 'Updated PR Title',
    body: 'Updated PR description with more details',
  }),
});
```

### 3. Enhanced Auto-Commit with Draft PR
```typescript
// In workspace settings
{
  autoPrEnabled: true,
  createDraftPr: true, // Creates draft PRs for crowned runs
}
```

## Testing

Comprehensive test coverage is provided in:
- `githubPREnhanced.test.ts`: Unit tests for the enhanced utility class
- `github.prs.open.route.test.ts`: Integration tests for API endpoints

### Test Coverage
- ✅ PR creation (basic and draft)
- ✅ PR updates (title, body, labels, assignees)
- ✅ Draft management (convert to/from draft)
- ✅ Status checks and comments
- ✅ Merge operations with branch deletion
- ✅ Error handling scenarios
- ✅ API endpoint integration

## Migration Guide

### For Existing Users
1. **No Breaking Changes**: All existing functionality remains unchanged
2. **New Features Opt-in**: Draft PR creation is optional via `createAsDraft` parameter
3. **Enhanced Error Messages**: Automatic improvement in error reporting

### For New Implementations
1. **Use Enhanced Endpoints**: Prefer the new `/update` endpoint for PR modifications
2. **Leverage Draft PRs**: Use draft PRs for work-in-progress changes
3. **Enable Auto-PR with Drafts**: Set `createDraftPr: true` in workspace settings

## Future Enhancements

### Planned Features
1. **PR Templates**: Support for repository PR templates
2. **Automated Labeling**: AI-based label suggestions
3. **Dependency Awareness**: Automatic detection of dependent PRs
4. **Merge Queue Integration**: Support for GitHub merge queues
5. **Webhook Enhancements**: Real-time PR status updates

### Performance Optimizations
1. **Batch Operations**: Process multiple PR operations in parallel
2. **Caching**: Cache PR status to reduce API calls
3. **Rate Limit Handling**: Improved retry logic for GitHub rate limits

## Security Considerations

1. **Token Scoping**: GitHub tokens require appropriate permissions
2. **Access Control**: Team-based access control for all PR operations
3. **Audit Logging**: All PR operations are logged for audit purposes
4. **Input Validation**: Strict validation of all user inputs

## Troubleshooting

### Common Issues

1. **PR Creation Fails with 403**
   - Check GitHub token permissions
   - Verify user has write access to repository

2. **Draft PR Not Converting**
   - Ensure PR is actually in draft state
   - Check GraphQL API permissions

3. **Auto-Commit Not Creating PR**
   - Verify `autoPrEnabled` workspace setting
   - Check if run is marked as crowned

### Debug Commands

```bash
# Check GitHub token permissions
curl -H "Authorization: token $GITHUB_TOKEN" \
     https://api.github.com/user

# List PRs for repository
gh pr list --repo owner/repo --state all

# Check PR details
gh pr view --repo owner/repo 42
```

## Support

For issues or questions regarding the enhanced GitHub PR functionality:
1. Check existing test cases for usage examples
2. Review error messages for specific guidance
3. Consult the GitHub API documentation for edge cases
4. Contact the development team for complex scenarios