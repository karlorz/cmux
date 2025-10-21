import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@cmux/convex/api";
import { isElectron } from "@/lib/electron";
import type { ElectronTaskCrownNotificationPayload } from "@/types/electron-task-notifications";
import type { Doc, Id } from "@cmux/convex/dataModel";

interface TaskWithSelectedRun extends Doc<"tasks"> {
  selectedTaskRun: (Doc<"taskRuns"> & {
    agentName?: string | null;
    crownReason?: string | null;
    isCrowned?: boolean | null;
  }) | null;
}

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  return navigator.userAgent.includes("Mac OS X");
}

function pickTaskTitle(text: string): string {
  const firstLine = text.split("\n").find((line) => line.trim().length > 0);
  const candidate = (firstLine ?? text).trim();
  return candidate.length > 120 ? `${candidate.slice(0, 117)}...` : candidate;
}

export function useTaskCompletionNotifications(teamSlugOrId: string): void {
  const navigate = useNavigate();
  const tasksWithRuns = useQuery(api.tasks.getTasksWithTaskRuns, {
    teamSlugOrId,
  }) as TaskWithSelectedRun[] | undefined;

  const seenRunIdsRef = useRef<Set<Id<"taskRuns">>>(new Set());
  const initializedRef = useRef(false);

  const isEligibleEnvironment = isElectron && isMacPlatform();

  useEffect(() => {
    if (!isEligibleEnvironment) {
      return;
    }
    const cmux = window.cmux;
    if (!cmux?.on) {
      return;
    }

    const unsubscribe = cmux.on("task:open-diff", (rawPayload: unknown) => {
      if (!rawPayload || typeof rawPayload !== "object") {
        return;
      }
      const payload = rawPayload as ElectronTaskCrownNotificationPayload;
      if (!payload.taskId || !payload.taskRunId || !payload.teamSlugOrId) {
        return;
      }
      void navigate({
        to: "/$teamSlugOrId/task/$taskId/run/$runId/diff",
        params: {
          teamSlugOrId: payload.teamSlugOrId,
          taskId: payload.taskId,
          runId: payload.taskRunId,
        },
      });
    });

    return () => {
      try {
        unsubscribe?.();
      } catch {
        // ignore unsubscribe failures
      }
    };
  }, [isEligibleEnvironment, navigate]);

  useEffect(() => {
    if (!isEligibleEnvironment) {
      return;
    }
    if (!tasksWithRuns) {
      return;
    }
    const cmux = window.cmux;
    const notify = cmux?.notifications?.showTaskCrowned;
    if (!notify) {
      return;
    }

    const eligibleRuns = tasksWithRuns
      .filter((task) => task.isCompleted && task.selectedTaskRun?.isCrowned)
      .map((task) => ({ task, run: task.selectedTaskRun! }));

    if (!initializedRef.current) {
      const seen = seenRunIdsRef.current;
      for (const { run } of eligibleRuns) {
        seen.add(run._id);
      }
      initializedRef.current = true;
      return;
    }

    for (const { task, run } of eligibleRuns) {
      const runId = run._id;
      const seen = seenRunIdsRef.current;
      if (seen.has(runId)) {
        continue;
      }

      seen.add(runId);

      const payload: ElectronTaskCrownNotificationPayload = {
        teamSlugOrId,
        taskId: task._id,
        taskRunId: runId,
        taskTitle: pickTaskTitle(task.text),
        agentName: run.agentName ?? null,
        crownReason: run.crownReason ?? null,
      };

      void notify(payload).catch(() => {
        // swallow notification errors; nothing actionable for the user here
      });
    }
  }, [isEligibleEnvironment, tasksWithRuns, teamSlugOrId]);
}
