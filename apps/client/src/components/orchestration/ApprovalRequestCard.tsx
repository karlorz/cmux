import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@cmux/convex/api";
import {
  AlertTriangle,
  Check,
  X,
  Clock,
  Shield,
  FileCode,
  Terminal,
  DollarSign,
  ArrowUpCircle,
  Loader2,
} from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import type { Doc } from "@cmux/convex/dataModel";

type ApprovalRequest = Doc<"approvalRequests">;
type Resolution =
  | "allow"
  | "allow_once"
  | "allow_session"
  | "deny"
  | "deny_always";

const APPROVAL_TYPE_CONFIG = {
  tool_permission: {
    icon: Terminal,
    label: "Tool Permission",
    color: "text-blue-500",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
  },
  review_request: {
    icon: FileCode,
    label: "Review Request",
    color: "text-purple-500",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
  },
  deployment: {
    icon: ArrowUpCircle,
    label: "Deployment",
    color: "text-green-500",
    bgColor: "bg-green-100 dark:bg-green-900/30",
  },
  cost_override: {
    icon: DollarSign,
    label: "Cost Override",
    color: "text-amber-500",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
  },
  escalation: {
    icon: ArrowUpCircle,
    label: "Escalation",
    color: "text-orange-500",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
  },
  risky_action: {
    icon: AlertTriangle,
    label: "Risky Action",
    color: "text-red-500",
    bgColor: "bg-red-100 dark:bg-red-900/30",
  },
} as const;

const RISK_LEVEL_CONFIG = {
  low: { color: "text-green-600 dark:text-green-400", label: "Low Risk" },
  medium: { color: "text-amber-600 dark:text-amber-400", label: "Medium Risk" },
  high: { color: "text-red-600 dark:text-red-400", label: "High Risk" },
} as const;

interface ApprovalRequestCardProps {
  request: ApprovalRequest;
  teamSlugOrId: string;
  onResolved?: () => void;
}

export function ApprovalRequestCard({
  request,
  teamSlugOrId,
  onResolved,
}: ApprovalRequestCardProps) {
  const [isResolving, setIsResolving] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const resolveRequest = useMutation(api.approvalBroker.resolveRequest);

  const typeConfig =
    APPROVAL_TYPE_CONFIG[
      request.approvalType as keyof typeof APPROVAL_TYPE_CONFIG
    ] ?? APPROVAL_TYPE_CONFIG.escalation;
  const TypeIcon = typeConfig.icon;

  const riskLevel = request.context?.riskLevel as
    | keyof typeof RISK_LEVEL_CONFIG
    | undefined;
  const riskConfig = riskLevel ? RISK_LEVEL_CONFIG[riskLevel] : null;

  const handleResolve = async (resolution: Resolution) => {
    setIsResolving(true);
    try {
      await resolveRequest({
        teamSlugOrId,
        requestId: request.requestId,
        resolution,
      });
      toast.success(
        resolution.startsWith("allow") ? "Request approved" : "Request denied"
      );
      onResolved?.();
    } catch (error) {
      toast.error(
        `Failed to resolve: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setIsResolving(false);
      setShowOptions(false);
    }
  };

  const isPending = request.status === "pending";
  const isExpired =
    request.expiresAt && request.expiresAt < Date.now() && isPending;

  return (
    <div
      className={clsx(
        "rounded-lg border p-3",
        isPending
          ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
          : "border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/50"
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-2">
        <div className={clsx("rounded-md p-1.5", typeConfig.bgColor)}>
          <TypeIcon className={clsx("size-4", typeConfig.color)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {typeConfig.label}
            </span>
            {riskConfig && (
              <span className={clsx("text-xs font-medium", riskConfig.color)}>
                {riskConfig.label}
              </span>
            )}
            {isExpired && (
              <span className="text-xs font-medium text-red-600 dark:text-red-400">
                Expired
              </span>
            )}
          </div>

          <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            From: {request.context?.agentName ?? "Unknown agent"}
          </div>
        </div>

        {/* Status badge */}
        {!isPending && (
          <span
            className={clsx(
              "rounded px-1.5 py-0.5 text-xs font-medium",
              request.status === "approved" &&
                "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
              request.status === "denied" &&
                "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
              request.status === "expired" &&
                "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
              request.status === "cancelled" &&
                "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
            )}
          >
            {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
          </span>
        )}
      </div>

      {/* Action being requested */}
      <div className="mt-2 rounded bg-neutral-100 px-2 py-1.5 text-sm font-mono text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
        {request.action}
      </div>

      {/* Reasoning if present */}
      {request.context?.reasoning && (
        <div className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
          <span className="font-medium">Reason:</span> {request.context.reasoning}
        </div>
      )}

      {/* File path if present */}
      {request.context?.filePath && (
        <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          <span className="font-medium">File:</span>{" "}
          <code className="rounded bg-neutral-200 px-1 dark:bg-neutral-700">
            {request.context.filePath}
          </code>
        </div>
      )}

      {/* Command if present */}
      {request.context?.command && (
        <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          <span className="font-medium">Command:</span>{" "}
          <code className="rounded bg-neutral-200 px-1 dark:bg-neutral-700">
            {request.context.command}
          </code>
        </div>
      )}

      {/* Expiration warning */}
      {request.expiresAt && isPending && !isExpired && (
        <div className="mt-2 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
          <Clock className="size-3" />
          Expires: {new Date(request.expiresAt).toLocaleString()}
        </div>
      )}

      {/* Actions for pending requests */}
      {isPending && !isExpired && (
        <div className="mt-3 flex items-center gap-2">
          {!showOptions ? (
            <>
              <button
                type="button"
                onClick={() => handleResolve("allow")}
                disabled={isResolving}
                className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {isResolving ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Check className="size-3" />
                )}
                Approve
              </button>
              <button
                type="button"
                onClick={() => handleResolve("deny")}
                disabled={isResolving}
                className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isResolving ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <X className="size-3" />
                )}
                Deny
              </button>
              <button
                type="button"
                onClick={() => setShowOptions(true)}
                className="text-xs text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
              >
                More options...
              </button>
            </>
          ) : (
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => handleResolve("allow_once")}
                disabled={isResolving}
                className="rounded border border-green-300 px-2 py-1 text-xs text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/30"
              >
                Allow Once
              </button>
              <button
                type="button"
                onClick={() => handleResolve("allow_session")}
                disabled={isResolving}
                className="rounded border border-green-300 px-2 py-1 text-xs text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/30"
              >
                Allow Session
              </button>
              <button
                type="button"
                onClick={() => handleResolve("deny_always")}
                disabled={isResolving}
                className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/30"
              >
                Deny Always
              </button>
              <button
                type="button"
                onClick={() => setShowOptions(false)}
                className="px-2 py-1 text-xs text-neutral-500 hover:text-neutral-700 dark:text-neutral-400"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Timestamp */}
      <div className="mt-2 text-xs text-neutral-400">
        {new Date(request.createdAt).toLocaleString()}
        {request.resolvedAt && (
          <span>
            {" "}
            • Resolved: {new Date(request.resolvedAt).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}

interface ApprovalRequestListProps {
  teamSlugOrId: string;
  orchestrationId?: string;
  limit?: number;
}

export function ApprovalRequestList({
  teamSlugOrId,
  orchestrationId,
  limit = 20,
}: ApprovalRequestListProps) {
  // Query pending requests by team (the common case for the panel)
  const requests = useQuery(api.approvalBroker.getPendingByTeam, {
    teamSlugOrId,
    limit,
  });

  if (requests === undefined) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="size-5 animate-spin text-neutral-400" />
      </div>
    );
  }

  // Filter by orchestrationId if provided
  const filteredRequests = orchestrationId
    ? requests.filter((r) => r.orchestrationId === orchestrationId)
    : requests;

  if (filteredRequests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-6 text-neutral-500 dark:text-neutral-400">
        <Shield className="size-8 text-neutral-300 dark:text-neutral-600" />
        <span className="text-sm">No pending approvals</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {filteredRequests.map((request) => (
        <ApprovalRequestCard
          key={request._id}
          request={request}
          teamSlugOrId={teamSlugOrId}
        />
      ))}
    </div>
  );
}
