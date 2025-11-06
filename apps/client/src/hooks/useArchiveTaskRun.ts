import { useSocket } from "@/contexts/socket/use-socket";
import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { useMutation } from "convex/react";
import { useCallback } from "react";
import { toast } from "sonner";

export function useArchiveTaskRun(teamSlugOrId: string) {
  const { socket } = useSocket();

  const archiveMutation = useMutation(api.taskRuns.archive);
  const unarchiveMutation = useMutation(api.taskRuns.unarchive);

  const emitArchiveEvent = useCallback(
    (taskRunId: Id<"taskRuns">) => {
      if (!socket) return;
      socket.emit(
        "archive-task-run",
        { taskRunId },
        (response: { success: boolean; error?: string }) => {
          if (!response.success) {
            console.error("Failed to stop containers for task run:", {
              taskRunId,
              error: response.error,
            });
          }
        }
      );
    },
    [socket]
  );

  const archive = useCallback(
    async (taskRunId: Id<"taskRuns">) => {
      try {
        await archiveMutation({ teamSlugOrId, id: taskRunId });
        emitArchiveEvent(taskRunId);
        toast("Task run archived");
      } catch (error) {
        console.error("Failed to archive task run", error);
        toast.error("Failed to archive task run");
        throw error;
      }
    },
    [archiveMutation, emitArchiveEvent, teamSlugOrId]
  );

  const unarchive = useCallback(
    async (taskRunId: Id<"taskRuns">) => {
      try {
        await unarchiveMutation({ teamSlugOrId, id: taskRunId });
        toast("Task run unarchived");
      } catch (error) {
        console.error("Failed to unarchive task run", error);
        toast.error("Failed to unarchive task run");
        throw error;
      }
    },
    [teamSlugOrId, unarchiveMutation]
  );

  return {
    archive,
    unarchive,
  };
}
