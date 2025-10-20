import { api } from "@cmux/convex/api";
import { useQuery } from "convex/react";
import { CheckCircle, XCircle, Clock, AlertCircle, ExternalLink } from "lucide-react";
import clsx from "clsx";



function getStatusIcon(status: string | null, conclusion: string | null) {
  if (status === "in_progress" || status === "pending" || status === "waiting" || status === "queued") {
    return <Clock className="h-4 w-4 text-yellow-500" />;
  }
  if (conclusion === "success") {
    return <CheckCircle className="h-4 w-4 text-green-500" />;
  }
  if (conclusion === "failure" || conclusion === "timed_out" || conclusion === "action_required") {
    return <XCircle className="h-4 w-4 text-red-500" />;
  }
  if (conclusion === "cancelled" || conclusion === "skipped" || conclusion === "stale") {
    return <AlertCircle className="h-4 w-4 text-gray-500" />;
  }
  return <Clock className="h-4 w-4 text-gray-500" />;
}

function getStatusColor(status: string | null, conclusion: string | null) {
  if (status === "in_progress" || status === "pending" || status === "waiting" || status === "queued") {
    return "text-yellow-600";
  }
  if (conclusion === "success") {
    return "text-green-600";
  }
  if (conclusion === "failure" || conclusion === "timed_out" || conclusion === "action_required") {
    return "text-red-600";
  }
  return "text-gray-600";
}

function formatStatus(status: string | null, conclusion: string | null) {
  if (status === "in_progress") return "In progress";
  if (status === "pending" || status === "waiting" || status === "queued") return "Queued";
  if (conclusion === "success") return "Success";
  if (conclusion === "failure") return "Failure";
  if (conclusion === "timed_out") return "Timed out";
  if (conclusion === "cancelled") return "Cancelled";
  if (conclusion === "skipped") return "Skipped";
  if (conclusion === "stale") return "Stale";
  if (conclusion === "action_required") return "Action required";
  return "Unknown";
}

function CheckItem({
  name,
  status,
  conclusion,
  url,
  subtitle,
}: {
  name: string;
  status: string | null;
  conclusion: string | null;
  url: string | null;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
      {getStatusIcon(status, conclusion)}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-neutral-900 dark:text-neutral-100 truncate">
            {name}
          </span>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        {subtitle && (
          <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
            {subtitle}
          </div>
        )}
      </div>
      <span className={clsx("text-xs font-medium", getStatusColor(status, conclusion))}>
        {formatStatus(status, conclusion)}
      </span>
    </div>
  );
}

export function TaskRunChecks({
  teamSlugOrId,
  runId,
}: {
  teamSlugOrId: string;
  runId: any;
}) {
  const checks = useQuery(api.taskRuns.getChecksForTaskRun, {
    teamSlugOrId,
    runId,
  });

  if (!checks) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="w-6 h-6 border-2 border-neutral-300 dark:border-neutral-600 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  const { checkRuns, workflowRuns, commitStatuses } = checks;
  const totalChecks = checkRuns.length + workflowRuns.length + commitStatuses.length;

  if (totalChecks === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-neutral-500 dark:text-neutral-400">
        <CheckCircle className="h-12 w-12 mb-4 text-neutral-300 dark:text-neutral-600" />
        <p className="text-sm font-medium mb-1">No checks yet</p>
        <p className="text-xs text-center">
          Checks will appear here once CI/CD workflows start running.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Check Runs */}
      {checkRuns.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
            Check Runs ({checkRuns.length})
          </h3>
          <div className="space-y-2">
            {checkRuns.map((check, index) => (
              <CheckItem
                key={`check-${index}`}
                name={check.name}
                status={check.status}
                conclusion={check.conclusion}
                url={check.htmlUrl}
                subtitle={check.appName || check.appSlug || undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* Workflow Runs */}
      {workflowRuns.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
            Workflows ({workflowRuns.length})
          </h3>
          <div className="space-y-2">
            {workflowRuns.map((workflow, index) => (
              <CheckItem
                key={`workflow-${index}`}
                name={workflow.workflowName}
                status={workflow.status}
                conclusion={workflow.conclusion}
                url={workflow.htmlUrl}
                subtitle={workflow.name || workflow.actorLogin || undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* Commit Statuses */}
      {commitStatuses.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
            Status Checks ({commitStatuses.length})
          </h3>
          <div className="space-y-2">
            {commitStatuses.map((status, index) => (
              <CheckItem
                key={`status-${index}`}
                name={status.context}
                status={null}
                conclusion={status.state}
                url={status.targetUrl}
                subtitle={status.description || status.creatorLogin || undefined}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}