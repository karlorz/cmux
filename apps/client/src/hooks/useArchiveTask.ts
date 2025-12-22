import { convexQueryClient } from "@/contexts/convex/convex-query-client";
import { useSocket } from "@/contexts/socket/use-socket";
import { api } from "@cmux/convex/api";
import type { Doc } from "@cmux/convex/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useMutation } from "convex/react";
import { toast } from "sonner";

export function useArchiveTask(teamSlugOrId: string) {
  const { socket } = useSocket();

  type TasksGetArgs = {
    teamSlugOrId: string;
    projectFullName?: string;
    archived?: boolean;
  };

  const archiveMutation = useMutation(api.tasks.archive).withOptimisticUpdate(
    (localStore, args) => {
      const updateLists = (keyArgs: TasksGetArgs) => {
        const active = localStore.getQuery(api.tasks.get, keyArgs);
        if (!active) return;
        const idx = active.findIndex((t) => t._id === args.id);
        if (idx >= 0) {
          const [task] = active.splice(idx, 1);
          // Try to also update the archived list if present in store
          const archivedArgs: TasksGetArgs = { ...keyArgs, archived: true };
          const archived = localStore.getQuery(api.tasks.get, archivedArgs);
          if (archived !== undefined && task) {
            localStore.setQuery(api.tasks.get, archivedArgs, [
              { ...task, isArchived: true },
              ...archived,
            ]);
          }
          localStore.setQuery(api.tasks.get, keyArgs, [...active]);
        }
      };
      // default args variant used across app
      updateLists({ teamSlugOrId });
      updateLists({ teamSlugOrId, archived: false });

      // Also update getById query if it exists (used by preview list)
      const detailArgs = { teamSlugOrId: args.teamSlugOrId, id: args.id };
      const existingDetail = localStore.getQuery(api.tasks.getById, detailArgs);
      if (existingDetail) {
        localStore.setQuery(api.tasks.getById, detailArgs, {
          ...existingDetail,
          isArchived: true,
        });
      }

      // Also update getPreviewTasks query if it exists (used by sidebar previews)
      const previewArgs = { teamSlugOrId: args.teamSlugOrId };
      const previewTasks = localStore.getQuery(
        api.tasks.getPreviewTasks,
        previewArgs
      );
      if (previewTasks) {
        localStore.setQuery(
          api.tasks.getPreviewTasks,
          previewArgs,
          previewTasks.filter((t) => t._id !== args.id)
        );
      }

      // Also update previewRuns.listByTeam query if it exists (used by dashboard previews tab)
      const previewRunsArgs = { teamSlugOrId: args.teamSlugOrId };
      const previewRuns = localStore.getQuery(
        api.previewRuns.listByTeam,
        previewRunsArgs
      );
      if (previewRuns) {
        localStore.setQuery(
          api.previewRuns.listByTeam,
          previewRunsArgs,
          previewRuns.filter((run) => run.taskId !== args.id)
        );
      }

      // Also update getPinned query if it exists (used by sidebar pinned section)
      const pinnedArgs = { teamSlugOrId: args.teamSlugOrId };
      const pinnedTasks = localStore.getQuery(api.tasks.getPinned, pinnedArgs);
      if (pinnedTasks) {
        localStore.setQuery(
          api.tasks.getPinned,
          pinnedArgs,
          pinnedTasks.filter((t) => t._id !== args.id)
        );
      }
    }
  );

  const unarchiveMutation = useMutation(
    api.tasks.unarchive
  ).withOptimisticUpdate((localStore, args) => {
    const updateLists = (keyArgs: TasksGetArgs) => {
      const archivedArgs: TasksGetArgs = { ...keyArgs, archived: true };
      const archived = localStore.getQuery(api.tasks.get, archivedArgs);
      if (!archived) return;
      const idx = archived.findIndex((t) => t._id === args.id);
      if (idx >= 0) {
        const [task] = archived.splice(idx, 1);
        const active = localStore.getQuery(api.tasks.get, keyArgs);
        if (active !== undefined && task) {
          localStore.setQuery(api.tasks.get, keyArgs, [
            { ...task, isArchived: false },
            ...active,
          ]);
        }
        localStore.setQuery(api.tasks.get, archivedArgs, [...archived]);
      }
    };
    updateLists({ teamSlugOrId });
    updateLists({ teamSlugOrId, archived: false });

    // Also update getById query if it exists (used by preview list)
    const detailArgs = { teamSlugOrId: args.teamSlugOrId, id: args.id };
    const existingDetail = localStore.getQuery(api.tasks.getById, detailArgs);
    if (existingDetail) {
      localStore.setQuery(api.tasks.getById, detailArgs, {
        ...existingDetail,
        isArchived: false,
      });
    }
  });

  // Helper to update React Query cache (used alongside Convex optimistic updates)
  // The layout uses convexQuery wrapper with React Query, which has a separate cache
  const invalidateReactQueryCache = (taskId: Doc<"tasks">["_id"]) => {
    const queryClient = convexQueryClient.queryClient;

    // Get current tasks from React Query cache and filter out the archived task
    const tasksQueryKey = convexQuery(api.tasks.get, {
      teamSlugOrId,
      archived: false,
    }).queryKey;
    const currentTasks = queryClient.getQueryData<Doc<"tasks">[]>(tasksQueryKey);
    if (currentTasks) {
      queryClient.setQueryData(
        tasksQueryKey,
        currentTasks.filter((t) => t._id !== taskId)
      );
    }

    // Also update the variant without explicit archived: false (used by workspaces)
    const tasksQueryKeyNoArchived = convexQuery(api.tasks.get, {
      teamSlugOrId,
    }).queryKey;
    const currentTasksNoArchived =
      queryClient.getQueryData<Doc<"tasks">[]>(tasksQueryKeyNoArchived);
    if (currentTasksNoArchived) {
      queryClient.setQueryData(
        tasksQueryKeyNoArchived,
        currentTasksNoArchived.filter((t) => t._id !== taskId)
      );
    }
  };

  const archiveWithUndo = (task: Doc<"tasks">) => {
    archiveMutation({ teamSlugOrId, id: task._id });
    invalidateReactQueryCache(task._id);

    // Emit socket event to stop/pause containers
    if (socket) {
      socket.emit(
        "archive-task",
        { taskId: task._id },
        (response: { success: boolean; error?: string }) => {
          if (!response.success) {
            console.error("Failed to stop containers:", response.error);
          }
        }
      );
    }

    toast("Task archived", {
      action: {
        label: "Undo",
        onClick: () => unarchiveMutation({ teamSlugOrId, id: task._id }),
      },
    });
  };

  const archive = (id: string) => {
    archiveMutation({
      teamSlugOrId,
      id: id as Doc<"tasks">["_id"],
    });
    invalidateReactQueryCache(id as Doc<"tasks">["_id"]);

    // Emit socket event to stop/pause containers
    if (socket) {
      socket.emit(
        "archive-task",
        { taskId: id as Doc<"tasks">["_id"] },
        (response: { success: boolean; error?: string }) => {
          if (!response.success) {
            console.error("Failed to stop containers:", response.error);
          }
        }
      );
    }
  };

  return {
    archive,
    unarchive: (id: string) =>
      unarchiveMutation({
        teamSlugOrId,
        id: id as Doc<"tasks">["_id"],
      }),
    archiveWithUndo,
  };
}
