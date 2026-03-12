import { api } from "@cmux/convex/api";
import { useQuery as useConvexQuery } from "convex/react";
import { FileCode, FolderOpen } from "lucide-react";
import { memo, useMemo, useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface FileChangeHeatmapProps {
  teamSlugOrId: string;
  days?: number;
  className?: string;
}

interface FileChange {
  path: string;
  additions: number;
  deletions: number;
  status: "added" | "modified" | "deleted" | "renamed";
}

interface DirectoryGroup {
  directory: string;
  files: FileChange[];
  totalAdditions: number;
  totalDeletions: number;
}

function getIntensityClass(additions: number, maxAdditions: number): string {
  if (maxAdditions === 0) return "bg-neutral-100 dark:bg-neutral-800";
  const ratio = additions / maxAdditions;
  if (ratio > 0.8) return "bg-emerald-500 dark:bg-emerald-600";
  if (ratio > 0.6) return "bg-emerald-400 dark:bg-emerald-500";
  if (ratio > 0.4) return "bg-emerald-300 dark:bg-emerald-400";
  if (ratio > 0.2) return "bg-emerald-200 dark:bg-emerald-300";
  return "bg-emerald-100 dark:bg-emerald-200";
}

function getBarWidth(additions: number, maxAdditions: number): string {
  if (maxAdditions === 0) return "0%";
  const ratio = Math.min(additions / maxAdditions, 1);
  return `${Math.max(ratio * 100, 5)}%`;
}

function FileRow({
  file,
  maxAdditions,
}: {
  file: FileChange;
  maxAdditions: number;
}) {
  const fileName = file.path.split("/").pop() ?? file.path;

  return (
    <div className="group flex items-center gap-2 py-1">
      <FileCode className="size-3.5 shrink-0 text-neutral-400 dark:text-neutral-500" />
      <span
        className="min-w-0 flex-1 truncate text-xs text-neutral-700 dark:text-neutral-300"
        title={file.path}
      >
        {fileName}
      </span>
      <div className="flex w-24 items-center gap-1">
        <div className="relative h-3 flex-1 overflow-hidden rounded-sm bg-neutral-100 dark:bg-neutral-800">
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-sm transition-all",
              getIntensityClass(file.additions, maxAdditions)
            )}
            style={{ width: getBarWidth(file.additions, maxAdditions) }}
          />
        </div>
        <span className="w-12 text-right text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
          +{file.additions}
        </span>
      </div>
      {file.deletions > 0 && (
        <span className="w-10 text-right text-xs tabular-nums text-red-500 dark:text-red-400">
          -{file.deletions}
        </span>
      )}
      {file.deletions === 0 && <span className="w-10" />}
      <span
        className={cn(
          "w-14 text-right text-xs",
          file.status === "added" && "text-emerald-600 dark:text-emerald-400",
          file.status === "deleted" && "text-red-500 dark:text-red-400",
          file.status === "modified" && "text-amber-600 dark:text-amber-400",
          file.status === "renamed" && "text-blue-600 dark:text-blue-400"
        )}
      >
        {file.status}
      </span>
    </div>
  );
}

function DirectorySection({
  group,
  maxAdditions,
  isExpanded,
  onToggle,
}: {
  group: DirectoryGroup;
  maxAdditions: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-neutral-100 last:border-b-0 dark:border-neutral-800">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 py-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
      >
        <FolderOpen className="size-4 text-amber-500 dark:text-amber-400" />
        <span className="flex-1 text-sm font-medium text-neutral-800 dark:text-neutral-200">
          {group.directory || "(root)"}
        </span>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {group.files.length} files
        </span>
        <span className="text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
          +{group.totalAdditions}
        </span>
        {group.totalDeletions > 0 && (
          <span className="text-xs tabular-nums text-red-500 dark:text-red-400">
            -{group.totalDeletions}
          </span>
        )}
      </button>
      {isExpanded && (
        <div className="pb-2 pl-6">
          {group.files.map((file) => (
            <FileRow key={file.path} file={file} maxAdditions={maxAdditions} />
          ))}
        </div>
      )}
    </div>
  );
}

function FileChangeHeatmapContent({ teamSlugOrId, days = 7 }: FileChangeHeatmapProps) {
  const result = useConvexQuery(api.sessionActivity.listByTeam, {
    teamSlugOrId,
    limit: 50,
  });

  const sessions = useMemo(() => result?.items ?? [], [result?.items]);

  // Aggregate all file changes and group by directory
  const { groups, maxAdditions, totalFiles, totalAdditions, totalDeletions } = useMemo(() => {
    const fileMap = new Map<string, FileChange>();

    // Aggregate changes across all sessions within the time period
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    for (const session of sessions) {
      if (new Date(session.startedAt).getTime() < cutoff) continue;

      for (const file of session.filesChanged) {
        const existing = fileMap.get(file.path);
        if (existing) {
          existing.additions += file.additions;
          existing.deletions += file.deletions;
        } else {
          fileMap.set(file.path, { ...file });
        }
      }
    }

    // Group by directory
    const dirMap = new Map<string, DirectoryGroup>();
    let maxAdd = 0;

    for (const file of fileMap.values()) {
      const parts = file.path.split("/");
      const directory = parts.slice(0, -1).join("/");

      if (!dirMap.has(directory)) {
        dirMap.set(directory, {
          directory,
          files: [],
          totalAdditions: 0,
          totalDeletions: 0,
        });
      }

      const group = dirMap.get(directory)!;
      group.files.push(file);
      group.totalAdditions += file.additions;
      group.totalDeletions += file.deletions;

      if (file.additions > maxAdd) {
        maxAdd = file.additions;
      }
    }

    // Sort directories by total additions (descending)
    const sortedGroups = Array.from(dirMap.values())
      .sort((a, b) => b.totalAdditions - a.totalAdditions)
      .map((group) => ({
        ...group,
        // Sort files within each directory by additions (descending)
        files: group.files.sort((a, b) => b.additions - a.additions),
      }));

    // Compute totals in the same pass
    const totalFiles = sortedGroups.reduce((sum, g) => sum + g.files.length, 0);
    const totalAdditions = sortedGroups.reduce((sum, g) => sum + g.totalAdditions, 0);
    const totalDeletions = sortedGroups.reduce((sum, g) => sum + g.totalDeletions, 0);

    return { groups: sortedGroups, maxAdditions: maxAdd, totalFiles, totalAdditions, totalDeletions };
  }, [sessions, days]);

  // Track expanded directories - initialize with top 3 when groups are available
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [initialized, setInitialized] = useState(false);

  // Initialize expanded to top 3 directories once when groups first load
  useEffect(() => {
    if (groups.length > 0 && !initialized) {
      setExpanded(new Set(groups.slice(0, 3).map((g) => g.directory)));
      setInitialized(true);
    }
  }, [groups, initialized]);

  const toggleDir = (dir: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) {
        next.delete(dir);
      } else {
        next.add(dir);
      }
      return next;
    });
  };

  if (!result) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-neutral-500 dark:text-neutral-400">Loading...</div>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <FileCode className="size-8 text-neutral-300 dark:text-neutral-600" />
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No file changes in the last {days} days
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
        <span>{totalFiles} files across {groups.length} directories</span>
        <div className="flex items-center gap-3">
          <span className="text-emerald-600 dark:text-emerald-400">+{totalAdditions}</span>
          <span className="text-red-500 dark:text-red-400">-{totalDeletions}</span>
        </div>
      </div>

      {/* Directory list */}
      <div className="max-h-96 overflow-y-auto">
        {groups.map((group) => (
          <DirectorySection
            key={group.directory}
            group={group}
            maxAdditions={maxAdditions}
            isExpanded={expanded.has(group.directory)}
            onToggle={() => toggleDir(group.directory)}
          />
        ))}
      </div>
    </div>
  );
}

export const FileChangeHeatmap = memo(function FileChangeHeatmap({
  teamSlugOrId,
  days = 7,
  className,
}: FileChangeHeatmapProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900",
        className
      )}
    >
      <div className="mb-4">
        <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          File Change Heatmap
        </h3>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Files changed by intensity over the last {days} days
        </p>
      </div>
      <FileChangeHeatmapContent teamSlugOrId={teamSlugOrId} days={days} />
    </div>
  );
});
