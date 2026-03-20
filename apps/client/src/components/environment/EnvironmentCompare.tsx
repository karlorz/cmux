import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { memo, useMemo, useState } from "react";
import { ArrowLeftRight, Check, Download, X } from "lucide-react";

type EnvironmentCompareProps = {
  teamSlugOrId: string;
  envIdA?: Id<"environments">;
  envIdB?: Id<"environments">;
  onClose?: () => void;
};

type DiffFieldProps = {
  field: string;
  valueA: unknown;
  valueB: unknown;
  isDifferent: boolean;
};

function formatValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "(not set)";
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "(empty)";
    return value.join(", ");
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function DiffField({ field, valueA, valueB, isDifferent }: DiffFieldProps) {
  const isMultiline =
    (typeof valueA === "string" && valueA.includes("\n")) ||
    (typeof valueB === "string" && valueB.includes("\n"));

  return (
    <div
      className={`border-b border-neutral-100 dark:border-neutral-800 ${isDifferent ? "bg-amber-50/50 dark:bg-amber-900/10" : ""}`}
    >
      <div className="grid grid-cols-[1fr_2fr_2fr] gap-2 py-2 px-3">
        {/* Field name */}
        <div className="flex items-start gap-2">
          {isDifferent ? (
            <X className="size-3.5 text-amber-500 mt-0.5 shrink-0" />
          ) : (
            <Check className="size-3.5 text-green-500 mt-0.5 shrink-0" />
          )}
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300 capitalize">
            {field.replace(/([A-Z])/g, " $1").trim()}
          </span>
        </div>

        {/* Value A */}
        <div
          className={`text-sm ${isMultiline ? "whitespace-pre-wrap font-mono text-xs" : ""} ${isDifferent ? "text-neutral-900 dark:text-neutral-100" : "text-neutral-500 dark:text-neutral-400"}`}
        >
          {formatValue(valueA)}
        </div>

        {/* Value B */}
        <div
          className={`text-sm ${isMultiline ? "whitespace-pre-wrap font-mono text-xs" : ""} ${isDifferent ? "text-neutral-900 dark:text-neutral-100" : "text-neutral-500 dark:text-neutral-400"}`}
        >
          {formatValue(valueB)}
        </div>
      </div>
    </div>
  );
}

function EnvironmentCompareSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-[1fr_2fr_2fr] gap-2 py-2 px-3">
        <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded w-24" />
        <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded w-32" />
        <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded w-32" />
      </div>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="grid grid-cols-[1fr_2fr_2fr] gap-2 py-2 px-3">
          <div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded w-20" />
          <div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded w-full" />
          <div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded w-full" />
        </div>
      ))}
    </div>
  );
}

export const EnvironmentCompare = memo(function EnvironmentCompare({
  teamSlugOrId,
  envIdA,
  envIdB,
  onClose,
}: EnvironmentCompareProps) {
  const [showOnlyDifferences, setShowOnlyDifferences] = useState(false);

  const environmentsQuery = useQuery(
    convexQuery(api.environments.list, { teamSlugOrId })
  );

  const compareQuery = useQuery({
    ...convexQuery(api.environments.compare, {
      teamSlugOrId,
      envIdA: envIdA as Id<"environments">,
      envIdB: envIdB as Id<"environments">,
    }),
    enabled: !!envIdA && !!envIdB,
  });

  const exportConfigA = useQuery({
    ...convexQuery(api.environments.exportConfig, {
      teamSlugOrId,
      id: envIdA as Id<"environments">,
    }),
    enabled: !!envIdA,
  });

  const filteredDifferences = useMemo(() => {
    if (!compareQuery.data?.differences) return [];
    if (showOnlyDifferences) {
      return compareQuery.data.differences.filter((d) => d.isDifferent);
    }
    return compareQuery.data.differences;
  }, [compareQuery.data?.differences, showOnlyDifferences]);

  const handleExport = () => {
    if (!exportConfigA.data) return;
    const blob = new Blob([JSON.stringify(exportConfigA.data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `environment-${exportConfigA.data.name?.replace(/\s+/g, "-").toLowerCase() || "export"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!envIdA || !envIdB) {
    return (
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-700/60 bg-white dark:bg-neutral-800/50 p-6">
        <div className="flex items-center gap-2 mb-4">
          <ArrowLeftRight className="size-5 text-neutral-500" />
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Compare Environments
          </h3>
        </div>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
          Select two environments to compare their configurations.
        </p>
        <div className="text-sm text-neutral-400 dark:text-neutral-500">
          {environmentsQuery.data?.length === 0
            ? "No environments available"
            : `${environmentsQuery.data?.length ?? 0} environments available`}
        </div>
      </div>
    );
  }

  if (compareQuery.isLoading) {
    return (
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-700/60 bg-white dark:bg-neutral-800/50 p-4">
        <EnvironmentCompareSkeleton />
      </div>
    );
  }

  if (!compareQuery.data) {
    return (
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-700/60 bg-white dark:bg-neutral-800/50 p-6">
        <p className="text-sm text-red-500">
          Failed to load comparison. One or both environments may not exist.
        </p>
      </div>
    );
  }

  const { envA, envB, hasDifferences } = compareQuery.data;

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700/60 bg-white dark:bg-neutral-800/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700/60 bg-neutral-50 dark:bg-neutral-800/30">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="size-4 text-neutral-500" />
          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Environment Comparison
          </span>
          {hasDifferences ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
              Has differences
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
              Identical
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={!exportConfigA.data}
            className="flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50"
          >
            <Download className="size-3" />
            Export A
          </button>
          <label className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showOnlyDifferences}
              onChange={(e) => setShowOnlyDifferences(e.target.checked)}
              className="rounded border-neutral-300 dark:border-neutral-600"
            />
            Only show differences
          </label>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700"
            >
              <X className="size-4 text-neutral-400" />
            </button>
          )}
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_2fr_2fr] gap-2 py-2 px-3 border-b border-neutral-200 dark:border-neutral-700/60 bg-neutral-50 dark:bg-neutral-800/20">
        <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
          Field
        </span>
        <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
          {envA.name}
        </span>
        <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
          {envB.name}
        </span>
      </div>

      {/* Comparison rows */}
      <div className="max-h-96 overflow-y-auto">
        {filteredDifferences.length === 0 ? (
          <div className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
            {showOnlyDifferences
              ? "No differences found"
              : "No fields to compare"}
          </div>
        ) : (
          filteredDifferences.map((diff) => (
            <DiffField
              key={diff.field}
              field={diff.field}
              valueA={diff.valueA}
              valueB={diff.valueB}
              isDifferent={diff.isDifferent}
            />
          ))
        )}
      </div>
    </div>
  );
});
