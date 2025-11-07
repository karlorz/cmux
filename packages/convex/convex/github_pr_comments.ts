import type {
  IssueCommentEvent,
  PullRequestReviewCommentEvent,
  PullRequestReviewEvent,
} from "@octokit/webhooks-types";
import { v } from "convex/values";

import { getTeamId } from "../_shared/team";
import { fetchInstallationAccessToken } from "../_shared/githubApp";
import {
  internalAction,
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { authQuery } from "./users/utils";

type CommentType = "issue_comment" | "review_comment" | "review";
type ReviewState =
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "COMMENTED"
  | "DISMISSED"
  | "PENDING";

type ReactionCounts = {
  totalCount?: number;
  plusOne?: number;
  minusOne?: number;
  laugh?: number;
  hooray?: number;
  confused?: number;
  heart?: number;
  rocket?: number;
  eyes?: number;
};

type CommentRecord = Omit<Doc<"githubPrComments">, "_id" | "_creationTime">;

type ReactionContent =
  | "+1"
  | "-1"
  | "laugh"
  | "hooray"
  | "confused"
  | "heart"
  | "rocket"
  | "eyes";

type ReactionWebhookPayload = {
  action?: string;
  reaction?: { content?: string | null } | null;
  comment?: { id?: number | string | null } | null;
  pull_request_review?: { id?: number | string | null } | null;
};

const REVIEW_STATES = new Set<ReviewState>([
  "APPROVED",
  "CHANGES_REQUESTED",
  "COMMENTED",
  "DISMISSED",
  "PENDING",
]);

const IMMUTABLE_FIELDS = new Set<keyof CommentRecord>([
  "provider",
  "installationId",
  "repoFullName",
  "prNumber",
  "commentId",
  "teamId",
]);

const MILLIS_THRESHOLD = 1_000_000_000_000;

const REACTION_FIELD_MAP: Record<
  ReactionContent,
  keyof ReactionCounts & string
> = {
  "+1": "plusOne",
  "-1": "minusOne",
  laugh: "laugh",
  hooray: "hooray",
  confused: "confused",
  heart: "heart",
  rocket: "rocket",
  eyes: "eyes",
};

function ts(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > MILLIS_THRESHOLD
      ? Math.round(value)
      : Math.round(value * 1000);
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeReviewState(value: unknown): ReviewState | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const upper = value.toUpperCase() as ReviewState;
  return REVIEW_STATES.has(upper) ? upper : undefined;
}

function normalizeSide(value: unknown): "LEFT" | "RIGHT" | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const upper = value.toUpperCase();
  if (upper === "LEFT" || upper === "RIGHT") {
    return upper;
  }
  return undefined;
}

function assignIfDefined<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function reactionCountsEqual(
  current?: ReactionCounts,
  next?: ReactionCounts,
): boolean {
  if (!current && !next) {
    return true;
  }
  if (!current || !next) {
    return false;
  }
  const fields: (keyof ReactionCounts)[] = [
    "totalCount",
    "plusOne",
    "minusOne",
    "laugh",
    "hooray",
    "confused",
    "heart",
    "rocket",
    "eyes",
  ];
  return fields.every((field) => (current[field] ?? 0) === (next[field] ?? 0));
}

function mapReactions(summary: unknown): ReactionCounts | undefined {
  if (!summary || typeof summary !== "object") {
    return undefined;
  }
  const source = summary as Record<string, unknown>;
  const mapped: ReactionCounts = {};
  assignIfDefined(mapped, "totalCount", num(source.total_count));
  assignIfDefined(mapped, "plusOne", num(source["+1"]));
  assignIfDefined(mapped, "minusOne", num(source["-1"]));
  assignIfDefined(mapped, "laugh", num(source.laugh));
  assignIfDefined(mapped, "hooray", num(source.hooray));
  assignIfDefined(mapped, "confused", num(source.confused));
  assignIfDefined(mapped, "heart", num(source.heart));
  assignIfDefined(mapped, "rocket", num(source.rocket));
  assignIfDefined(mapped, "eyes", num(source.eyes));
  return Object.keys(mapped).length > 0 ? mapped : undefined;
}

function createBaseRecord(params: {
  installationId: number;
  repoFullName: string;
  teamId: string;
  prNumber: number;
  commentId: number;
  type: CommentType;
  createdAt: number;
  updatedAt: number;
}): CommentRecord {
  return {
    provider: "github",
    installationId: params.installationId,
    repoFullName: params.repoFullName,
    teamId: params.teamId,
    prNumber: params.prNumber,
    commentId: params.commentId,
    type: params.type,
    createdAt: params.createdAt,
    updatedAt: params.updatedAt,
    lastSyncedAt: Date.now(),
  };
}

async function upsertComment(
  ctx: MutationCtx,
  record: CommentRecord,
): Promise<void> {
  const existing = await ctx.db
    .query("githubPrComments")
    .withIndex("by_commentId", (q) => q.eq("commentId", record.commentId))
    .first();

  if (!existing) {
    await ctx.db.insert("githubPrComments", record);
    return;
  }

  const patch: Partial<Doc<"githubPrComments">> = {
    lastSyncedAt: record.lastSyncedAt,
  };
  for (const [key, value] of Object.entries(record) as [
    keyof CommentRecord,
    CommentRecord[keyof CommentRecord],
  ][]) {
    if (IMMUTABLE_FIELDS.has(key)) {
      continue;
    }
    if (value === undefined) {
      continue;
    }
    if (key === "reactions") {
      if (!reactionCountsEqual(existing.reactions, value as ReactionCounts)) {
        patch.reactions = value as ReactionCounts;
      }
      continue;
    }
    if (existing[key] !== value) {
      patch[key] = value as never;
    }
  }

  if (Object.keys(patch).length > 1) {
    await ctx.db.patch(existing._id, patch);
  } else if (patch.lastSyncedAt !== existing.lastSyncedAt) {
    await ctx.db.patch(existing._id, { lastSyncedAt: patch.lastSyncedAt });
  }
}

function extractReactionCommentId(
  payload: ReactionWebhookPayload,
): number | undefined {
  return num(payload.comment?.id) ?? num(payload.pull_request_review?.id);
}

function reactionContentFromPayload(
  payload: ReactionWebhookPayload,
): ReactionContent | undefined {
  const content = payload.reaction?.content;
  if (typeof content !== "string") {
    return undefined;
  }
  if ((content as ReactionContent) in REACTION_FIELD_MAP) {
    return content as ReactionContent;
  }
  return undefined;
}

export const upsertIssueCommentFromWebhook = internalMutation({
  args: {
    installationId: v.number(),
    repoFullName: v.string(),
    teamId: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const payload = args.payload as IssueCommentEvent;
    if (!payload.issue?.pull_request) {
      return;
    }
    const prNumber = num(payload.issue.number);
    const commentId = num(payload.comment?.id);
    if (!prNumber || !commentId) {
      return;
    }
    const now = Date.now();
    const createdAt = ts(payload.comment?.created_at) ?? now;
    const updatedAt = ts(payload.comment?.updated_at) ?? createdAt;
    const record = createBaseRecord({
      installationId: args.installationId,
      repoFullName: args.repoFullName,
      teamId: args.teamId,
      prNumber,
      commentId,
      type: "issue_comment",
      createdAt,
      updatedAt,
    });
    assignIfDefined(record, "repositoryId", num(payload.repository?.id));
    assignIfDefined(record, "pullRequestId", num(payload.issue.id));
    assignIfDefined(
      record,
      "pullRequestUrl",
      nonEmptyString(payload.issue.html_url),
    );
    assignIfDefined(
      record,
      "nodeId",
      stringOrUndefined(payload.comment?.node_id),
    );
    assignIfDefined(record, "body", stringOrUndefined(payload.comment?.body));
    assignIfDefined(
      record,
      "authorLogin",
      nonEmptyString(payload.comment?.user?.login),
    );
    assignIfDefined(record, "authorId", num(payload.comment?.user?.id));
    assignIfDefined(
      record,
      "authorType",
      nonEmptyString(payload.comment?.user?.type),
    );
    assignIfDefined(
      record,
      "authorAvatarUrl",
      nonEmptyString(payload.comment?.user?.avatar_url),
    );
    assignIfDefined(
      record,
      "authorAssociation",
      nonEmptyString(payload.comment?.author_association),
    );
    assignIfDefined(
      record,
      "htmlUrl",
      nonEmptyString(payload.comment?.html_url),
    );
    assignIfDefined(record, "url", nonEmptyString(payload.comment?.url));
    assignIfDefined(
      record,
      "reactions",
      mapReactions(payload.comment?.reactions),
    );
    if (payload.action === "deleted") {
      record.isDeleted = true;
      record.deletedAt = now;
    }
    await upsertComment(ctx, record);
  },
});

export const upsertReviewCommentFromWebhook = internalMutation({
  args: {
    installationId: v.number(),
    repoFullName: v.string(),
    teamId: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const payload = args.payload as PullRequestReviewCommentEvent;
    const prNumber = num(payload.pull_request?.number);
    const commentId = num(payload.comment?.id);
    if (!prNumber || !commentId) {
      return;
    }
    const now = Date.now();
    const createdAt = ts(payload.comment?.created_at) ?? now;
    const updatedAt = ts(payload.comment?.updated_at) ?? createdAt;
    const record = createBaseRecord({
      installationId: args.installationId,
      repoFullName: args.repoFullName,
      teamId: args.teamId,
      prNumber,
      commentId,
      type: "review_comment",
      createdAt,
      updatedAt,
    });
    assignIfDefined(record, "repositoryId", num(payload.repository?.id));
    assignIfDefined(record, "pullRequestId", num(payload.pull_request?.id));
    assignIfDefined(
      record,
      "pullRequestUrl",
      nonEmptyString(payload.pull_request?.html_url),
    );
    assignIfDefined(
      record,
      "nodeId",
      stringOrUndefined(payload.comment?.node_id),
    );
    assignIfDefined(record, "body", stringOrUndefined(payload.comment?.body));
    assignIfDefined(
      record,
      "authorLogin",
      nonEmptyString(payload.comment?.user?.login),
    );
    assignIfDefined(record, "authorId", num(payload.comment?.user?.id));
    assignIfDefined(
      record,
      "authorType",
      nonEmptyString(payload.comment?.user?.type),
    );
    assignIfDefined(
      record,
      "authorAvatarUrl",
      nonEmptyString(payload.comment?.user?.avatar_url),
    );
    assignIfDefined(
      record,
      "authorAssociation",
      nonEmptyString(payload.comment?.author_association),
    );
    assignIfDefined(
      record,
      "htmlUrl",
      nonEmptyString(payload.comment?.html_url),
    );
    assignIfDefined(record, "url", nonEmptyString(payload.comment?.url));
    assignIfDefined(
      record,
      "reviewId",
      num(payload.comment?.pull_request_review_id),
    );
    assignIfDefined(
      record,
      "inReplyToId",
      num(payload.comment?.in_reply_to_id),
    );
    assignIfDefined(
      record,
      "commitId",
      stringOrUndefined(payload.comment?.commit_id),
    );
    assignIfDefined(
      record,
      "diffHunk",
      stringOrUndefined(payload.comment?.diff_hunk),
    );
    assignIfDefined(record, "path", stringOrUndefined(payload.comment?.path));
    assignIfDefined(record, "position", num(payload.comment?.position));
    assignIfDefined(
      record,
      "originalPosition",
      num(payload.comment?.original_position),
    );
    assignIfDefined(record, "line", num(payload.comment?.line));
    assignIfDefined(
      record,
      "originalLine",
      num(payload.comment?.original_line),
    );
    assignIfDefined(record, "startLine", num(payload.comment?.start_line));
    assignIfDefined(
      record,
      "originalStartLine",
      num(payload.comment?.original_start_line),
    );
    assignIfDefined(record, "side", normalizeSide(payload.comment?.side));
    assignIfDefined(
      record,
      "startSide",
      normalizeSide(payload.comment?.start_side),
    );
    assignIfDefined(
      record,
      "reactions",
      mapReactions(payload.comment?.reactions),
    );
    if (payload.action === "deleted") {
      record.isDeleted = true;
      record.deletedAt = now;
    }
    await upsertComment(ctx, record);
  },
});

export const upsertReviewFromWebhook = internalMutation({
  args: {
    installationId: v.number(),
    repoFullName: v.string(),
    teamId: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const payload = args.payload as PullRequestReviewEvent;
    const prNumber = num(payload.pull_request?.number);
    const reviewId = num(payload.review?.id);
    if (!prNumber || !reviewId) {
      return;
    }
    const now = Date.now();
    const submittedAt = ts(payload.review?.submitted_at) ?? now;
    const record = createBaseRecord({
      installationId: args.installationId,
      repoFullName: args.repoFullName,
      teamId: args.teamId,
      prNumber,
      commentId: reviewId,
      type: "review",
      createdAt: submittedAt,
      updatedAt: submittedAt,
    });
    assignIfDefined(record, "repositoryId", num(payload.repository?.id));
    assignIfDefined(record, "pullRequestId", num(payload.pull_request?.id));
    assignIfDefined(
      record,
      "pullRequestUrl",
      nonEmptyString(payload.pull_request?.html_url),
    );
    assignIfDefined(
      record,
      "nodeId",
      stringOrUndefined(payload.review?.node_id),
    );
    assignIfDefined(record, "body", stringOrUndefined(payload.review?.body));
    assignIfDefined(
      record,
      "authorLogin",
      nonEmptyString(payload.review?.user?.login),
    );
    assignIfDefined(record, "authorId", num(payload.review?.user?.id));
    assignIfDefined(
      record,
      "authorType",
      nonEmptyString(payload.review?.user?.type),
    );
    assignIfDefined(
      record,
      "authorAvatarUrl",
      nonEmptyString(payload.review?.user?.avatar_url),
    );
    assignIfDefined(
      record,
      "authorAssociation",
      nonEmptyString(payload.review?.author_association),
    );
    assignIfDefined(
      record,
      "htmlUrl",
      nonEmptyString(payload.review?.html_url),
    );
    assignIfDefined(record, "reviewId", reviewId);
    assignIfDefined(
      record,
      "commitId",
      stringOrUndefined(payload.review?.commit_id),
    );
    assignIfDefined(record, "submittedAt", submittedAt);
    assignIfDefined(
      record,
      "reviewState",
      normalizeReviewState(payload.review?.state),
    );
    if (payload.action === "dismissed") {
      record.isDismissed = true;
      record.dismissedAt = now;
    }
    await upsertComment(ctx, record);
  },
});

export const applyReactionFromWebhook = internalMutation({
  args: {
    installationId: v.number(),
    repoFullName: v.string(),
    teamId: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const payload = args.payload as ReactionWebhookPayload;
    const commentId = extractReactionCommentId(payload);
    const content = reactionContentFromPayload(payload);
    if (!commentId || !content) {
      return;
    }
    const delta =
      payload.action === "deleted" ? -1 : payload.action === "created" ? 1 : 0;
    if (delta === 0) {
      return;
    }
    const doc = await ctx.db
      .query("githubPrComments")
      .withIndex("by_commentId", (q) => q.eq("commentId", commentId))
      .first();
    if (!doc) {
      return;
    }
    const field = REACTION_FIELD_MAP[content];
    const currentReactions: ReactionCounts = { ...(doc.reactions ?? {}) };
    const nextCount = Math.max(0, (currentReactions[field] ?? 0) + delta);
    const nextTotal = Math.max(0, (currentReactions.totalCount ?? 0) + delta);
    currentReactions[field] = nextCount;
    currentReactions.totalCount = nextTotal;
    await ctx.db.patch(doc._id, {
      reactions: currentReactions,
      lastSyncedAt: Date.now(),
    });
  },
});

export const listForPullRequest = authQuery({
  args: {
    teamSlugOrId: v.string(),
    repoFullName: v.string(),
    prNumber: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const limit = Math.min(Math.max(args.limit ?? 250, 1), 500);
    const query = ctx.db
      .query("githubPrComments")
      .withIndex("by_team_repo_pr", (q) =>
        q
          .eq("teamId", teamId)
          .eq("repoFullName", args.repoFullName)
          .eq("prNumber", args.prNumber),
      )
      .order("asc");
    return await query.take(limit);
  },
});

export const addPrReaction = internalAction({
  args: {
    installationId: v.number(),
    repoFullName: v.string(),
    prNumber: v.number(),
    content: v.literal("eyes"),
  },
  handler: async (
    _ctx,
    { installationId, repoFullName, prNumber, content },
  ) => {
    try {
      const accessToken = await fetchInstallationAccessToken(installationId);
      if (!accessToken) {
        console.error(
          "[github_pr_comments] Failed to get access token for installation",
          { installationId },
        );
        return { ok: false, error: "Failed to get access token" };
      }

      const response = await fetch(
        `https://api.github.com/repos/${repoFullName}/issues/${prNumber}/reactions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "cmux-github-bot",
          },
          body: JSON.stringify({ content }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[github_pr_comments] Failed to add reaction", {
          installationId,
          repoFullName,
          prNumber,
          status: response.status,
          error: errorText,
        });
        return {
          ok: false,
          error: `GitHub API error: ${response.status}`,
        };
      }

      const data = await response.json();
      console.log("[github_pr_comments] Successfully added reaction", {
        installationId,
        repoFullName,
        prNumber,
        reactionId: data.id,
      });

      return { ok: true, reactionId: data.id };
    } catch (error) {
      console.error("[github_pr_comments] Unexpected error adding reaction", {
        installationId,
        repoFullName,
        prNumber,
        error,
      });
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
