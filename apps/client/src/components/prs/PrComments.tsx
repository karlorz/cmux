import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { useQuery } from "convex/react";
import { MessageSquare, Code2, ThumbsUp, ThumbsDown, Laugh, Rocket, Heart, Eye, PartyPopper, HelpCircle } from "lucide-react";
import { useMemo } from "react";

type PrCommentsProps = {
  pullRequestId: Id<"pullRequests">;
};

type ReactionType = "plusOne" | "minusOne" | "laugh" | "hooray" | "confused" | "heart" | "rocket" | "eyes";

const REACTION_ICONS: Record<ReactionType, { icon: React.ComponentType<{ className?: string }>; label: string; emoji: string }> = {
  plusOne: { icon: ThumbsUp, label: "+1", emoji: "👍" },
  minusOne: { icon: ThumbsDown, label: "-1", emoji: "👎" },
  laugh: { icon: Laugh, label: "Laugh", emoji: "😄" },
  hooray: { icon: PartyPopper, label: "Hooray", emoji: "🎉" },
  confused: { icon: HelpCircle, label: "Confused", emoji: "😕" },
  heart: { icon: Heart, label: "Heart", emoji: "❤️" },
  rocket: { icon: Rocket, label: "Rocket", emoji: "🚀" },
  eyes: { icon: Eye, label: "Eyes", emoji: "👀" },
};

function ReactionBadge({ type, count }: { type: ReactionType; count: number }) {
  if (count === 0) return null;

  const { emoji, label } = REACTION_ICONS[type];

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs border border-neutral-200 dark:border-neutral-700"
      title={`${label} (${count})`}
    >
      <span>{emoji}</span>
      <span className="font-medium">{count}</span>
    </span>
  );
}

function Reactions({ reactions }: { reactions?: {
  totalCount: number;
  plusOne: number;
  minusOne: number;
  laugh: number;
  hooray: number;
  confused: number;
  heart: number;
  rocket: number;
  eyes: number;
} | null }) {
  if (!reactions || reactions.totalCount === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {(Object.keys(REACTION_ICONS) as ReactionType[]).map((type) => (
        <ReactionBadge key={type} type={type} count={reactions[type]} />
      ))}
    </div>
  );
}

function IssueComment({ comment }: { comment: {
  body: string;
  authorLogin?: string | null;
  authorAvatarUrl?: string | null;
  createdAt?: number | null;
  htmlUrl?: string | null;
  reactions?: {
    totalCount: number;
    plusOne: number;
    minusOne: number;
    laugh: number;
    hooray: number;
    confused: number;
    heart: number;
    rocket: number;
    eyes: number;
  } | null;
} }) {
  const formattedDate = comment.createdAt
    ? new Date(comment.createdAt).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="flex gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50">
      {comment.authorAvatarUrl && (
        <img
          src={comment.authorAvatarUrl}
          alt={comment.authorLogin || "User"}
          className="w-8 h-8 rounded-full flex-shrink-0"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
            {comment.authorLogin || "Unknown"}
          </span>
          {formattedDate && (
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {formattedDate}
            </span>
          )}
          {comment.htmlUrl && (
            <a
              href={comment.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline ml-auto"
            >
              View on GitHub
            </a>
          )}
        </div>
        <div className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap break-words">
          {comment.body}
        </div>
        <Reactions reactions={comment.reactions} />
      </div>
    </div>
  );
}

function ReviewComment({ comment }: { comment: {
  body: string;
  path: string;
  line?: number | null;
  diffHunk?: string | null;
  authorLogin?: string | null;
  authorAvatarUrl?: string | null;
  createdAt?: number | null;
  htmlUrl?: string | null;
  reactions?: {
    totalCount: number;
    plusOne: number;
    minusOne: number;
    laugh: number;
    hooray: number;
    confused: number;
    heart: number;
    rocket: number;
    eyes: number;
  } | null;
} }) {
  const formattedDate = comment.createdAt
    ? new Date(comment.createdAt).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="flex gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50">
      <div className="flex-shrink-0">
        <Code2 className="w-8 h-8 p-1.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          {comment.authorAvatarUrl && (
            <img
              src={comment.authorAvatarUrl}
              alt={comment.authorLogin || "User"}
              className="w-5 h-5 rounded-full"
            />
          )}
          <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
            {comment.authorLogin || "Unknown"}
          </span>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            commented on
          </span>
          <code className="text-xs bg-neutral-200 dark:bg-neutral-800 px-1.5 py-0.5 rounded font-mono text-purple-600 dark:text-purple-400">
            {comment.path}
            {comment.line ? `:${comment.line}` : ""}
          </code>
          {formattedDate && (
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {formattedDate}
            </span>
          )}
          {comment.htmlUrl && (
            <a
              href={comment.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline ml-auto"
            >
              View on GitHub
            </a>
          )}
        </div>
        {comment.diffHunk && (
          <pre className="text-xs font-mono bg-neutral-100 dark:bg-neutral-900 p-2 rounded my-2 overflow-x-auto border border-neutral-200 dark:border-neutral-800">
            {comment.diffHunk}
          </pre>
        )}
        <div className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap break-words">
          {comment.body}
        </div>
        <Reactions reactions={comment.reactions} />
      </div>
    </div>
  );
}

export function PrComments({ pullRequestId }: PrCommentsProps) {
  const commentsData = useQuery(api.github_pr_comments.listAllComments, {
    pullRequestId,
  });

  const sortedComments = useMemo(() => {
    if (!commentsData) return [];

    const allComments = [
      ...commentsData.issueComments.map((c) => ({
        type: "issue" as const,
        timestamp: c.createdAt || 0,
        data: c,
      })),
      ...commentsData.reviewComments.map((c) => ({
        type: "review" as const,
        timestamp: c.createdAt || 0,
        data: c,
      })),
    ];

    return allComments.sort((a, b) => a.timestamp - b.timestamp);
  }, [commentsData]);

  if (!commentsData) {
    return (
      <div className="px-4 py-6">
        <div className="flex items-center justify-center text-neutral-500 dark:text-neutral-400 text-sm">
          Loading comments...
        </div>
      </div>
    );
  }

  const totalComments = sortedComments.length;

  if (totalComments === 0) {
    return (
      <div className="px-4 py-6">
        <div className="flex flex-col items-center justify-center text-neutral-500 dark:text-neutral-400 text-sm gap-2">
          <MessageSquare className="w-6 h-6" />
          <p>No comments yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Comments ({totalComments})
        </h2>
      </div>
      <div className="space-y-3">
        {sortedComments.map((comment) =>
          comment.type === "issue" ? (
            <IssueComment key={`issue-${comment.data._id}`} comment={comment.data} />
          ) : (
            <ReviewComment key={`review-${comment.data._id}`} comment={comment.data} />
          )
        )}
      </div>
    </div>
  );
}
