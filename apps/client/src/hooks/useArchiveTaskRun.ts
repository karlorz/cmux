import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { useMutation } from "convex/react";

interface UseArchiveTaskRunOptions {
  teamSlugOrId: string;
}

export function useArchiveTaskRun({ teamSlugOrId }: UseArchiveTaskRunOptions) {
  const archiveMutation = useMutation(api.taskRuns.archive);
  const unarchiveMutation = useMutation(api.taskRuns.unarchive);

  const archive = (runId: Id<"taskRuns">) =>
    archiveMutation({ teamSlugOrId, runId });

  const unarchive = (runId: Id<"taskRuns">) =>
    unarchiveMutation({ teamSlugOrId, runId });

  return {
    archive,
    unarchive,
  };
}
