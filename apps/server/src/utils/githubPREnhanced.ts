import { Octokit } from "octokit";

export interface GitHubPREnhancedOptions {
  createAsDraft?: boolean;
  autoConvertDraft?: boolean;
  enableStatusChecks?: boolean;
  assignReviewers?: string[];
  labels?: string[];
  milestone?: number;
}

export interface GitHubPRUpdateOptions {
  title?: string;
  body?: string;
  state?: 'open' | 'closed';
  base?: string;
  milestone?: number | null;
  labels?: string[] | null;
  assignees?: string[] | null;
}

export class GitHubPREnhanced {
  private octokit: Octokit;

  constructor(octokit: Octokit) {
    this.octokit = octokit;
  }

  /**
   * Create an enhanced pull request with additional options
   */
  async createPullRequest(
    owner: string,
    repo: string,
    title: string,
    head: string,
    base: string,
    body: string,
    options: GitHubPREnhancedOptions = {}
  ) {
    const {
      createAsDraft = false,
      labels,
      milestone,
      assignReviewers,
    } = options;

    // Create the pull request
    const { data: pr } = await this.octokit.rest.pulls.create({
      owner,
      repo,
      title,
      head,
      base,
      body,
      draft: createAsDraft,
    });

    // Apply additional configurations if provided
    const updateOperations: Promise<any>[] = [];

    if (labels && labels.length > 0) {
      updateOperations.push(
        this.octokit.rest.issues.addLabels({
          owner,
          repo,
          issue_number: pr.number,
          labels,
        })
      );
    }

    if (milestone) {
      updateOperations.push(
        this.octokit.rest.issues.update({
          owner,
          repo,
          issue_number: pr.number,
          milestone,
        })
      );
    }

    if (assignReviewers && assignReviewers.length > 0) {
      updateOperations.push(
        this.octokit.rest.pulls.requestReviewers({
          owner,
          repo,
          pull_number: pr.number,
          reviewers: assignReviewers,
        })
      );
    }

    // Wait for all update operations to complete
    if (updateOperations.length > 0) {
      await Promise.allSettled(updateOperations);
    }

    return pr;
  }

  /**
   * Update a pull request with enhanced options
   */
  async updatePullRequest(
    owner: string,
    repo: string,
    number: number,
    options: GitHubPRUpdateOptions
  ) {
    const updateData: any = {};

    if (options.title !== undefined) updateData.title = options.title;
    if (options.body !== undefined) updateData.body = options.body;
    if (options.state !== undefined) updateData.state = options.state;
    if (options.base !== undefined) updateData.base = options.base;
    if (options.milestone !== undefined) updateData.milestone = options.milestone;

    const { data: pr } = await this.octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: number,
      ...updateData,
    });

    // Handle labels separately if provided
    if (options.labels !== undefined) {
      if (options.labels === null) {
        // Remove all labels
        const { data: currentLabels } = await this.octokit.rest.issues.listLabelsOnIssue({
          owner,
          repo,
          issue_number: number,
        });
        
        await Promise.all(
          currentLabels.map(label =>
            this.octokit.rest.issues.removeLabel({
              owner,
              repo,
              issue_number: number,
              name: label.name,
            })
          )
        );
      } else if (options.labels.length > 0) {
        // Set new labels
        await this.octokit.rest.issues.setLabels({
          owner,
          repo,
          issue_number: number,
          labels: options.labels,
        });
      }
    }

    // Handle assignees separately if provided
    if (options.assignees !== undefined) {
      if (options.assignees === null) {
        // Remove all assignees
        await this.octokit.rest.issues.removeAssignees({
          owner,
          repo,
          issue_number: number,
          assignees: [],
        });
      } else if (options.assignees.length > 0) {
        // Set new assignees
        await this.octokit.rest.issues.addAssignees({
          owner,
          repo,
          issue_number: number,
          assignees: options.assignees,
        });
      }
    }

    return pr;
  }

  /**
   * Convert a pull request to draft
   */
  async convertToDraft(owner: string, repo: string, number: number): Promise<void> {
    const mutation = `
      mutation($pullRequestId: ID!) {
        convertPullRequestToDraft(input: { pullRequestId: $pullRequestId }) {
          pullRequest {
            id
            isDraft
          }
        }
      }
    `;

    await this.octokit.graphql(mutation, {
      pullRequestId: `PR_${owner}_${repo}_${number}`,
    });
  }

  /**
   * Mark a draft pull request as ready for review
   */
  async markReadyForReview(owner: string, repo: string, number: number): Promise<void> {
    const { data: pr } = await this.octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: number,
    });

    if (!pr.draft) {
      return;
    }

    const mutation = `
      mutation($pullRequestId: ID!) {
        markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {
          pullRequest {
            id
            isDraft
          }
        }
      }
    `;

    await this.octokit.graphql(mutation, {
      pullRequestId: pr.node_id,
    });
  }

  /**
   * Get pull request status checks
   */
  async getStatusChecks(owner: string, repo: string, number: number) {
    const { data: checks } = await this.octokit.rest.checks.listForRef({
      owner,
      repo,
      ref: `refs/pull/${number}/head`,
    });

    const { data: statuses } = await this.octokit.rest.repos.listCommitStatusesForRef({
      owner,
      repo,
      ref: `refs/pull/${number}/head`,
    });

    return {
      checks: checks.check_runs,
      statuses: statuses,
    };
  }

  /**
   * Add a comment to a pull request
   */
  async addComment(owner: string, repo: string, number: number, body: string) {
    const { data: comment } = await this.octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: number,
      body,
    });

    return comment;
  }

  /**
   * Get pull request comments
   */
  async getComments(owner: string, repo: string, number: number) {
    const { data: comments } = await this.octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: number,
    });

    return comments;
  }

  /**
   * Request reviewers for a pull request
   */
  async requestReviewers(
    owner: string,
    repo: string,
    number: number,
    reviewers: string[],
    team_reviewers?: string[]
  ) {
    const { data: pr } = await this.octokit.rest.pulls.requestReviewers({
      owner,
      repo,
      pull_number: number,
      reviewers,
      team_reviewers,
    });

    return pr;
  }

  /**
   * Merge a pull request with enhanced options
   */
  async mergePullRequest(
    owner: string,
    repo: string,
    number: number,
    method: 'merge' | 'squash' | 'rebase' = 'merge',
    commitTitle?: string,
    commitMessage?: string,
    options: {
      sha?: string;
      deleteBranch?: boolean;
    } = {}
  ) {
    const { data: result } = await this.octokit.rest.pulls.merge({
      owner,
      repo,
      pull_number: number,
      merge_method: method,
      commit_title: commitTitle,
      commit_message: commitMessage,
      sha: options.sha,
    });

    // Delete the branch if requested and merge was successful
    if (options.deleteBranch && result.merged) {
      try {
        const { data: pr } = await this.octokit.rest.pulls.get({
          owner,
          repo,
          pull_number: number,
        });

        if (pr.head.ref) {
          await this.octokit.rest.git.deleteRef({
            owner,
            repo,
            ref: `heads/${pr.head.ref}`,
          });
        }
      } catch (error) {
        console.warn(`Failed to delete branch after merge: ${error}`);
      }
    }

    return result;
  }
}