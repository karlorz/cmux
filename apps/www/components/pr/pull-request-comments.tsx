"use client";

import type {
  AnchorHTMLAttributes,
  HTMLAttributes,
  LiHTMLAttributes,
} from "react";
import { useMemo } from "react";
import { ExternalLink, Loader2, MessageSquare } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useConvexQuery } from "@convex-dev/react-query";

import type { Doc } from "@cmux/convex/dataModel";
import { api } from "@cmux/convex/api";

type GithubPrComment = Doc<"githubPrComments">;

type Props = {
  teamSlugOrId?: string | null;
  repoFullName: string;
  prNumber: number;
  pullRequestUrl?: string | null;
};

const MARKDOWN_COMPONENTS = {
  p: (props: HTMLAttributes<HTMLParagraphElement>) => (
    <p className="mb-3 last:mb-0" {...props} />
  ),
  ul: (props: HTMLAttributes<HTMLUListElement>) => (
    <ul className="mb-3 list-disc pl-5 text-neutral-800 last:mb-0" {...props} />
  ),
  ol: (props: HTMLAttributes<HTMLOListElement>) => (
    <ol className="mb-3 list-decimal pl-5 text-neutral-800 last:mb-0" {...props} />
  ),
  li: (props: LiHTMLAttributes<HTMLLIElement>) => (
    <li className="mb-1 last:mb-0" {...props} />
  ),
  code: (props: HTMLAttributes<HTMLElement>) => (
    <code className="rounded bg-neutral-100 px-1 py-0.5 text-[13px] text-neutral-800" {...props} />
  ),
  pre: (props: HTMLAttributes<HTMLPreElement>) => (
    <pre
      className="mb-3 overflow-x-auto rounded border border-neutral-200 bg-neutral-50 p-3 text-[13px] leading-snug text-neutral-800 last:mb-0"
      {...props}
    />
  ),
  a: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      className="text-sky-600 underline underline-offset-2 hover:text-sky-500"
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
};

const REACTION_FIELDS: Array<keyof NonNullable<GithubPrComment["reactions"]>> = [
  "plusOne",
  "minusOne",
  "laugh",
  "hooray",
  "confused",
  "heart",
  "rocket",
  "eyes",
];

const REACTION_EMOJI: Record<string, string> = {
  plusOne: "👍",
  minusOne: "👎",
  laugh: "😄",
  hooray: "🎉",
  confused: "😕",
  heart: "❤️",
  rocket: "🚀",
  eyes: "👀",
};

export function PullRequestCommentsSection({
  teamSlugOrId,
  repoFullName,
  prNumber,
  pullRequestUrl,
}: Props) {
  const queryArgs = useMemo(() => {
    if (!teamSlugOrId) {
      return "skip" as const;
    }
    return {
      teamSlugOrId,
      repoFullName,
      prNumber,
      limit: 500,
    };
  }, [teamSlugOrId, repoFullName, prNumber]);

  const comments = useConvexQuery(
    api.github_pr_comments.listForPullRequest,
    queryArgs,
  ) as GithubPrComment[] | undefined;

  return (
    <section className="mt-8 border-t border-neutral-200 pt-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-semibold text-neutral-900">
            <MessageSquare className="h-5 w-5 text-neutral-500" />
            GitHub comments
          </div>
          <p className="text-sm text-neutral-500">
            View the latest conversation happening on GitHub for this pull request.
          </p>
        </div>
        {pullRequestUrl ? (
          <a
            href={pullRequestUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-400 hover:text-neutral-900"
          >
            Open on GitHub
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </header>

      {!teamSlugOrId ? (
        <EmptyState message="Select a workspace team to view synced GitHub comments." />
      ) : queryArgs === "skip" ? (
        <EmptyState message="Select a workspace team to view synced GitHub comments." />
      ) : !comments ? (
        <div className="flex items-center gap-2 rounded border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading comments…
        </div>
      ) : comments.length === 0 ? (
        <EmptyState message="No GitHub comments have been synced for this pull request yet." />
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <CommentCard key={comment._id} comment={comment} />
          ))}
        </div>
      )}
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-600">
      {message}
    </div>
  );
}

function CommentCard({ comment }: { comment: GithubPrComment }) {
  const isDeleted = comment.isDeleted;
  const createdLabel = formatRelativeTime(comment.createdAt);
  const wasEdited =
    typeof comment.updatedAt === "number" &&
    comment.updatedAt - comment.createdAt > 60 * 1000;
  const context = getCommentContext(comment);
  const title = getCommentTitle(comment);

  return (
    <article className="rounded border border-neutral-200 bg-white p-4">
      <header className="flex items-start gap-3">
        <Avatar login={comment.authorLogin} avatarUrl={comment.authorAvatarUrl} />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
            <span className="font-semibold text-neutral-900">
              {comment.authorLogin ?? "Unknown user"}
            </span>
            <span className="text-neutral-300">•</span>
            <span>{title}</span>
            {context ? (
              <>
                <span className="text-neutral-300">•</span>
                <span className="text-neutral-500">{context}</span>
              </>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
            <span>{createdLabel}</span>
            {wasEdited ? <span className="text-neutral-400">(edited)</span> : null}
            {comment.htmlUrl ? (
              <>
                <span className="text-neutral-300">•</span>
                <a
                  href={comment.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-neutral-500 hover:text-neutral-800"
                >
                  View thread
                  <ExternalLink className="h-3 w-3" />
                </a>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mt-3 text-sm leading-relaxed text-neutral-800">
        {isDeleted ? (
          <p className="italic text-neutral-500">Comment deleted on GitHub.</p>
        ) : comment.body ? (
          <div className="space-y-3">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={MARKDOWN_COMPONENTS}
            >
              {comment.body}
            </ReactMarkdown>
          </div>
        ) : comment.type === "review" && comment.reviewState ? (
          <p className="font-medium text-neutral-700">
            {formatReviewState(comment.reviewState)}
          </p>
        ) : (
          <p className="text-neutral-500">No comment body provided.</p>
        )}
      </div>

      {comment.diffHunk && comment.type === "review_comment" ? (
        <pre className="mt-3 max-h-64 overflow-auto rounded border border-neutral-200 bg-neutral-50 p-3 text-[13px] leading-snug text-neutral-700">
          <code>{comment.diffHunk}</code>
        </pre>
      ) : null}

      <ReactionRow reactions={comment.reactions} />
    </article>
  );
}

function Avatar({
  login,
  avatarUrl,
}: {
  login?: string | null;
  avatarUrl?: string | null;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={login ?? "GitHub user"}
        className="h-9 w-9 rounded-full border border-neutral-200 object-cover"
        loading="lazy"
      />
    );
  }

  const fallback = login?.[0]?.toUpperCase() ?? "?";
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-neutral-100 text-sm font-semibold text-neutral-600">
      {fallback}
    </div>
  );
}

function ReactionRow({
  reactions,
}: {
  reactions?: GithubPrComment["reactions"];
}) {
  if (!reactions) {
    return null;
  }

  const entries = REACTION_FIELDS.flatMap((field) => {
    const count = reactions[field];
    if (!count || count <= 0) {
      return [];
    }
    return [{ key: field, emoji: REACTION_EMOJI[field], count }];
  });

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2 text-xs text-neutral-700">
      {entries.map(({ key, emoji, count }) => (
        <span
          key={key}
          className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5"
        >
          <span>{emoji ?? "👍"}</span>
          <span>{count}</span>
        </span>
      ))}
    </div>
  );
}

function getCommentTitle(comment: GithubPrComment): string {
  if (comment.type === "review") {
    return comment.reviewState
      ? `${formatReviewState(comment.reviewState)}`
      : "Submitted a review";
  }
  if (comment.type === "review_comment") {
    return "Commented on the diff";
  }
  return "Commented";
}

function getCommentContext(comment: GithubPrComment): string | null {
  if (comment.type === "review_comment" && comment.path) {
    const lineNumber = comment.line ?? comment.originalLine;
    return lineNumber ? `${comment.path}:${lineNumber}` : comment.path;
  }
  if (comment.type === "review" && comment.isDismissed) {
    return "Review dismissed";
  }
  return null;
}

function formatReviewState(
  state: GithubPrComment["reviewState"],
): string {
  switch (state) {
    case "APPROVED":
      return "Approved changes";
    case "CHANGES_REQUESTED":
      return "Requested changes";
    case "COMMENTED":
      return "Left a comment";
    case "DISMISSED":
      return "Review dismissed";
    case "PENDING":
      return "Review pending";
    default:
      return "Submitted a review";
  }
}

function formatRelativeTime(timestamp: number | undefined): string {
  if (!timestamp) {
    return "Unknown time";
  }
  const diff = Date.now() - timestamp;
  if (diff < 60 * 1000) {
    return "Just now";
  }
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000));
    return `${minutes}m ago`;
  }
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    return `${hours}h ago`;
  }
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    return `${days}d ago`;
  }
  return new Date(timestamp).toLocaleDateString();
}
