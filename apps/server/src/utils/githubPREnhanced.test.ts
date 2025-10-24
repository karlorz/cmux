import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitHubPREnhanced } from './githubPREnhanced';
import { Octokit } from 'octokit';

// Mock Octokit
const mockOctokit = {
  rest: {
    pulls: {
      create: vi.fn(),
      update: vi.fn(),
      get: vi.fn(),
      requestReviewers: vi.fn(),
      merge: vi.fn(),
    },
    issues: {
      addLabels: vi.fn(),
      update: vi.fn(),
      setLabels: vi.fn(),
      removeAssignees: vi.fn(),
      addAssignees: vi.fn(),
      createComment: vi.fn(),
      listComments: vi.fn(),
      listLabelsOnIssue: vi.fn(),
      removeLabel: vi.fn(),
    },
    checks: {
      listForRef: vi.fn(),
    },
    repos: {
      listCommitStatusesForRef: vi.fn(),
    },
    git: {
      deleteRef: vi.fn(),
    },
  },
  graphql: vi.fn(),
};

describe('GitHubPREnhanced', () => {
  let githubPR: GitHubPREnhanced;

  beforeEach(() => {
    vi.clearAllMocks();
    githubPR = new GitHubPREnhanced(mockOctokit as unknown as Octokit);
  });

  describe('createPullRequest', () => {
    it('should create a basic pull request', async () => {
      const mockPR = {
        number: 1,
        title: 'Test PR',
        html_url: 'https://github.com/test/repo/pull/1',
        draft: false,
      };

      mockOctokit.rest.pulls.create.mockResolvedValue({ data: mockPR });

      const result = await githubPR.createPullRequest(
        'test',
        'repo',
        'Test PR',
        'feature-branch',
        'main',
        'PR body'
      );

      expect(result).toEqual(mockPR);
      expect(mockOctokit.rest.pulls.create).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        title: 'Test PR',
        head: 'feature-branch',
        base: 'main',
        body: 'PR body',
        draft: false,
      });
    });

    it('should create a draft pull request', async () => {
      const mockPR = {
        number: 1,
        title: 'Draft PR',
        html_url: 'https://github.com/test/repo/pull/1',
        draft: true,
      };

      mockOctokit.rest.pulls.create.mockResolvedValue({ data: mockPR });

      const result = await githubPR.createPullRequest(
        'test',
        'repo',
        'Draft PR',
        'feature-branch',
        'main',
        'PR body',
        { createAsDraft: true }
      );

      expect(result).toEqual(mockPR);
      expect(mockOctokit.rest.pulls.create).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        title: 'Draft PR',
        head: 'feature-branch',
        base: 'main',
        body: 'PR body',
        draft: true,
      });
    });

    it('should create PR with labels and milestone', async () => {
      const mockPR = {
        number: 1,
        title: 'Enhanced PR',
        html_url: 'https://github.com/test/repo/pull/1',
        draft: false,
      };

      mockOctokit.rest.pulls.create.mockResolvedValue({ data: mockPR });
      mockOctokit.rest.issues.addLabels.mockResolvedValue({ data: [] });
      mockOctokit.rest.issues.update.mockResolvedValue({ data: [] });

      const result = await githubPR.createPullRequest(
        'test',
        'repo',
        'Enhanced PR',
        'feature-branch',
        'main',
        'PR body',
        {
          labels: ['bug', 'enhancement'],
          milestone: 5,
        }
      );

      expect(result).toEqual(mockPR);
      expect(mockOctokit.rest.issues.addLabels).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        issue_number: 1,
        labels: ['bug', 'enhancement'],
      });
      expect(mockOctokit.rest.issues.update).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        issue_number: 1,
        milestone: 5,
      });
    });
  });

  describe('updatePullRequest', () => {
    it('should update PR title and body', async () => {
      const mockPR = {
        number: 1,
        title: 'Updated Title',
        body: 'Updated body',
        html_url: 'https://github.com/test/repo/pull/1',
        state: 'open',
      };

      mockOctokit.rest.pulls.update.mockResolvedValue({ data: mockPR });

      const result = await githubPR.updatePullRequest(
        'test',
        'repo',
        1,
        {
          title: 'Updated Title',
          body: 'Updated body',
        }
      );

      expect(result).toEqual(mockPR);
      expect(mockOctokit.rest.pulls.update).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        pull_number: 1,
        title: 'Updated Title',
        body: 'Updated body',
      });
    });

    it('should update PR labels', async () => {
      const mockPR = {
        number: 1,
        title: 'PR with labels',
        html_url: 'https://github.com/test/repo/pull/1',
        state: 'open',
      };

      mockOctokit.rest.pulls.update.mockResolvedValue({ data: mockPR });
      mockOctokit.rest.issues.setLabels.mockResolvedValue({ data: [] });

      const result = await githubPR.updatePullRequest(
        'test',
        'repo',
        1,
        {
          labels: ['new-label', 'another-label'],
        }
      );

      expect(result).toEqual(mockPR);
      expect(mockOctokit.rest.issues.setLabels).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        issue_number: 1,
        labels: ['new-label', 'another-label'],
      });
    });

    it('should remove all labels when labels is null', async () => {
      const mockPR = {
        number: 1,
        title: 'PR without labels',
        html_url: 'https://github.com/test/repo/pull/1',
        state: 'open',
      };

      const mockLabels = [
        { name: 'old-label' },
        { name: 'another-old-label' },
      ];

      mockOctokit.rest.pulls.update.mockResolvedValue({ data: mockPR });
      mockOctokit.rest.issues.listLabelsOnIssue.mockResolvedValue({ data: mockLabels });
      mockOctokit.rest.issues.removeLabel.mockResolvedValue({ data: [] });

      const result = await githubPR.updatePullRequest(
        'test',
        'repo',
        1,
        {
          labels: null,
        }
      );

      expect(result).toEqual(mockPR);
      expect(mockOctokit.rest.issues.listLabelsOnIssue).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        issue_number: 1,
      });
      expect(mockOctokit.rest.issues.removeLabel).toHaveBeenCalledTimes(2);
    });
  });

  describe('convertToDraft', () => {
    it('should convert PR to draft using GraphQL', async () => {
      mockOctokit.graphql.mockResolvedValue({
        convertPullRequestToDraft: {
          pullRequest: {
            id: 'PR_test_repo_1',
            isDraft: true,
          },
        },
      });

      await githubPR.convertToDraft('test', 'repo', 1);

      expect(mockOctokit.graphql).toHaveBeenCalledWith(
        expect.stringContaining('convertPullRequestToDraft'),
        {
          pullRequestId: 'PR_test_repo_1',
        }
      );
    });
  });

  describe('markReadyForReview', () => {
    it('should mark draft PR as ready for review', async () => {
      const mockPR = {
        number: 1,
        draft: true,
        node_id: 'test-node-id',
      };

      mockOctokit.rest.pulls.get.mockResolvedValue({ data: mockPR });
      mockOctokit.graphql.mockResolvedValue({
        markPullRequestReadyForReview: {
          pullRequest: {
            id: 'test-node-id',
            isDraft: false,
          },
        },
      });

      await githubPR.markReadyForReview('test', 'repo', 1);

      expect(mockOctokit.rest.pulls.get).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        pull_number: 1,
      });
      expect(mockOctokit.graphql).toHaveBeenCalledWith(
        expect.stringContaining('markPullRequestReadyForReview'),
        {
          pullRequestId: 'test-node-id',
        }
      );
    });

    it('should not attempt to convert non-draft PR', async () => {
      const mockPR = {
        number: 1,
        draft: false,
        node_id: 'test-node-id',
      };

      mockOctokit.rest.pulls.get.mockResolvedValue({ data: mockPR });

      await githubPR.markReadyForReview('test', 'repo', 1);

      expect(mockOctokit.graphql).not.toHaveBeenCalled();
    });
  });

  describe('getStatusChecks', () => {
    it('should get both checks and statuses', async () => {
      const mockChecks = {
        check_runs: [
          { id: 1, name: 'CI', conclusion: 'success' },
          { id: 2, name: 'Tests', conclusion: 'failure' },
        ],
      };

      const mockStatuses = [
        { id: 1, state: 'success', description: 'Build passed' },
        { id: 2, state: 'pending', description: 'Tests running' },
      ];

      mockOctokit.rest.checks.listForRef.mockResolvedValue({ data: mockChecks });
      mockOctokit.rest.repos.listCommitStatusesForRef.mockResolvedValue({ data: mockStatuses });

      const result = await githubPR.getStatusChecks('test', 'repo', 1);

      expect(result).toEqual({
        checks: mockChecks.check_runs,
        statuses: mockStatuses,
      });

      expect(mockOctokit.rest.checks.listForRef).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        ref: 'refs/pull/1/head',
      });
      expect(mockOctokit.rest.repos.listCommitStatusesForRef).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        ref: 'refs/pull/1/head',
      });
    });
  });

  describe('mergePullRequest', () => {
    it('should merge pull request with default options', async () => {
      const mockResult = {
        merged: true,
        sha: 'abc123',
        message: 'Pull request successfully merged',
      };

      mockOctokit.rest.pulls.merge.mockResolvedValue({ data: mockResult });

      const result = await githubPR.mergePullRequest('test', 'repo', 1);

      expect(result).toEqual(mockResult);
      expect(mockOctokit.rest.pulls.merge).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        pull_number: 1,
        merge_method: 'merge',
      });
    });

    it('should merge pull request and delete branch', async () => {
      const mockResult = {
        merged: true,
        sha: 'abc123',
        message: 'Pull request successfully merged',
      };

      const mockPR = {
        head: { ref: 'feature-branch' },
      };

      mockOctokit.rest.pulls.merge.mockResolvedValue({ data: mockResult });
      mockOctokit.rest.pulls.get.mockResolvedValue({ data: mockPR });
      mockOctokit.rest.git.deleteRef.mockResolvedValue({ data: {} });

      const result = await githubPR.mergePullRequest(
        'test',
        'repo',
        1,
        'squash',
        'Custom title',
        'Custom message',
        { deleteBranch: true }
      );

      expect(result).toEqual(mockResult);
      expect(mockOctokit.rest.pulls.merge).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        pull_number: 1,
        merge_method: 'squash',
        commit_title: 'Custom title',
        commit_message: 'Custom message',
      });
      expect(mockOctokit.rest.git.deleteRef).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        ref: 'heads/feature-branch',
      });
    });

    it('should not delete branch if merge fails', async () => {
      const mockResult = {
        merged: false,
        sha: 'abc123',
        message: 'Merge conflict',
      };

      mockOctokit.rest.pulls.merge.mockResolvedValue({ data: mockResult });

      const result = await githubPR.mergePullRequest(
        'test',
        'repo',
        1,
        'merge',
        undefined,
        undefined,
        { deleteBranch: true }
      );

      expect(result).toEqual(mockResult);
      expect(mockOctokit.rest.git.deleteRef).not.toHaveBeenCalled();
    });
  });

  describe('addComment', () => {
    it('should add comment to pull request', async () => {
      const mockComment = {
        id: 1,
        body: 'Test comment',
        user: { login: 'test-user' },
      };

      mockOctokit.rest.issues.createComment.mockResolvedValue({ data: mockComment });

      const result = await githubPR.addComment('test', 'repo', 1, 'Test comment');

      expect(result).toEqual(mockComment);
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        issue_number: 1,
        body: 'Test comment',
      });
    });
  });

  describe('requestReviewers', () => {
    it('should request reviewers for pull request', async () => {
      const mockPR = {
        number: 1,
        title: 'PR with reviewers',
        requested_reviewers: [{ login: 'reviewer1' }],
      };

      mockOctokit.rest.pulls.requestReviewers.mockResolvedValue({ data: mockPR });

      const result = await githubPR.requestReviewers(
        'test',
        'repo',
        1,
        ['reviewer1', 'reviewer2'],
        ['team1']
      );

      expect(result).toEqual(mockPR);
      expect(mockOctokit.rest.pulls.requestReviewers).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        pull_number: 1,
        reviewers: ['reviewer1', 'reviewer2'],
        team_reviewers: ['team1'],
      });
    });
  });
});