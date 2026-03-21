import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@cmux/convex/api";
import { CheckCircle2, XCircle, Clock, TestTube2, AlertCircle } from "lucide-react";
import { parseTestOutput, looksLikeTestOutput, type ParsedTestResult } from "@/lib/parse-test-output";
import type { Id } from "@cmux/convex/dataModel";
import clsx from "clsx";

export interface TestResultsPanelProps {
  taskRunId: Id<"taskRuns"> | undefined;
}

interface TestResultCardProps {
  result: ParsedTestResult;
  timestamp: number;
}

function TestResultCard({ result, timestamp }: TestResultCardProps) {
  const { summary, framework, duration, tests } = result;
  const allPassed = summary.failed === 0;
  const formattedTime = new Date(timestamp).toLocaleTimeString();

  return (
    <div
      className={clsx(
        "rounded-lg border p-3",
        allPassed
          ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30"
          : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {allPassed ? (
            <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" />
          ) : (
            <XCircle className="size-4 text-red-600 dark:text-red-400" />
          )}
          <span
            className={clsx(
              "text-sm font-medium",
              allPassed
                ? "text-green-700 dark:text-green-300"
                : "text-red-700 dark:text-red-300"
            )}
          >
            {allPassed ? "All tests passed" : `${summary.failed} test${summary.failed > 1 ? "s" : ""} failed`}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          <span className="capitalize">{framework}</span>
          <span>{formattedTime}</span>
        </div>
      </div>

      {/* Summary stats */}
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1">
          <CheckCircle2 className="size-3 text-green-600 dark:text-green-400" />
          <span className="text-green-700 dark:text-green-300">
            {summary.passed} passed
          </span>
        </div>
        {summary.failed > 0 && (
          <div className="flex items-center gap-1">
            <XCircle className="size-3 text-red-600 dark:text-red-400" />
            <span className="text-red-700 dark:text-red-300">
              {summary.failed} failed
            </span>
          </div>
        )}
        {summary.skipped > 0 && (
          <div className="flex items-center gap-1">
            <AlertCircle className="size-3 text-yellow-600 dark:text-yellow-400" />
            <span className="text-yellow-700 dark:text-yellow-300">
              {summary.skipped} skipped
            </span>
          </div>
        )}
        {duration && (
          <div className="flex items-center gap-1 text-neutral-500 dark:text-neutral-400">
            <Clock className="size-3" />
            <span>{duration >= 1000 ? `${(duration / 1000).toFixed(1)}s` : `${duration}ms`}</span>
          </div>
        )}
      </div>

      {/* Individual test list (show failed tests if any) */}
      {tests.length > 0 && summary.failed > 0 && (
        <div className="mt-2 border-t border-red-200 dark:border-red-900 pt-2">
          <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-1">
            Failed tests:
          </p>
          <ul className="space-y-0.5">
            {tests
              .filter((t) => t.status === "fail")
              .slice(0, 5)
              .map((test, i) => (
                <li
                  key={`${test.name}-${i}`}
                  className="text-xs text-red-600 dark:text-red-400 font-mono truncate"
                  title={test.name}
                >
                  {test.name}
                </li>
              ))}
            {tests.filter((t) => t.status === "fail").length > 5 && (
              <li className="text-xs text-red-500 dark:text-red-400">
                ... and {tests.filter((t) => t.status === "fail").length - 5} more
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Panel that displays parsed test results from task run activity.
 * Subscribes to taskRunActivity and filters for Bash tool results that look like test output.
 */
export function TestResultsPanel({ taskRunId }: TestResultsPanelProps) {
  // Subscribe to activity for this task run
  const activity = useQuery(
    api.taskRunActivity.getByTaskRunAsc,
    taskRunId ? { taskRunId, limit: 100 } : "skip"
  );

  // Parse test results from bash command outputs
  const testResults = useMemo(() => {
    if (!activity) return [];

    const results: Array<{ result: ParsedTestResult; timestamp: number }> = [];

    for (const event of activity) {
      // Only look at tool_result events for Bash commands
      if (event.type !== "tool_result") continue;
      if (event.toolName !== "Bash") continue;

      // Quick filter before full parse
      const detail = event.detail ?? "";
      if (!looksLikeTestOutput(detail)) continue;

      // Attempt to parse
      const parsed = parseTestOutput(detail);
      if (parsed) {
        results.push({
          result: parsed,
          timestamp: event.createdAt,
        });
      }
    }

    // Return most recent first
    return results.reverse();
  }, [activity]);

  // No task run selected
  if (!taskRunId) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Select a run to view test results
      </div>
    );
  }

  // Loading state
  if (activity === undefined) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Loading test results...
      </div>
    );
  }

  // No test results found
  if (testResults.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 text-center gap-2">
        <TestTube2 className="size-8 text-neutral-300 dark:text-neutral-600" />
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No test results yet
        </p>
        <p className="text-xs text-neutral-400 dark:text-neutral-500 max-w-xs">
          Test results will appear here when the agent runs tests (vitest, jest, go test, etc.)
        </p>
      </div>
    );
  }

  // Summary of all results
  const totalRuns = testResults.length;
  const latestResult = testResults[0]?.result;
  const allPassing = testResults.every((r) => r.result.summary.failed === 0);

  return (
    <div className="h-full overflow-auto">
      {/* Summary header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-center gap-2">
          <TestTube2 className="size-4 text-neutral-500 dark:text-neutral-400" />
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
            Test Results
          </span>
        </div>
        <div className="flex items-center gap-2">
          {allPassing ? (
            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <CheckCircle2 className="size-3" />
              All passing
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
              <XCircle className="size-3" />
              {latestResult?.summary.failed ?? 0} failing
            </span>
          )}
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {totalRuns} run{totalRuns > 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Test result cards */}
      <div className="space-y-2 p-3">
        {testResults.map(({ result, timestamp }, index) => (
          <TestResultCard
            key={`${timestamp}-${index}`}
            result={result}
            timestamp={timestamp}
          />
        ))}
      </div>
    </div>
  );
}
