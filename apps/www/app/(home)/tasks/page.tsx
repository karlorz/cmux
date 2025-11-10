"use client";

import { api } from "@cmux/convex/api";
import { useQuery } from "convex/react";
import { useUser } from "@stackframe/stack";
import { TaskSection } from "@/components/tasks/task-section";
import { SiteHeader } from "@/components/site-header";
import { Loader2 } from "lucide-react";

export default function TasksPage() {
  const user = useUser();
  const teamSlugOrId = user?.selectedTeam?.id || "";

  const tasks = useQuery(
    api.tasks.get,
    teamSlugOrId ? { teamSlugOrId, archived: false } : "skip"
  );

  if (!user || !teamSlugOrId) {
    return (
      <div className="min-h-screen bg-[#030712] flex items-center justify-center">
        <p className="text-neutral-400">Please sign in to view tasks</p>
      </div>
    );
  }

  if (tasks === undefined) {
    return (
      <div className="min-h-screen bg-[#030712] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  // Categorize tasks
  const workspaceTasks = tasks.filter(
    (task) => task.isCloudWorkspace || task.isLocalWorkspace
  );

  const readyToReviewTasks = tasks.filter(
    (task) =>
      !workspaceTasks.includes(task) &&
      task.isCompleted &&
      task.mergeStatus &&
      ["pr_draft", "pr_open", "pr_approved", "pr_changes_requested"].includes(task.mergeStatus)
  );

  const inProgressTasks = tasks.filter(
    (task) =>
      !workspaceTasks.includes(task) &&
      !task.isCompleted &&
      (!task.mergeStatus || task.mergeStatus === "none")
  );

  const mergedTasks = tasks.filter(
    (task) =>
      !workspaceTasks.includes(task) &&
      task.mergeStatus &&
      ["pr_merged"].includes(task.mergeStatus)
  );

  return (
    <div className="relative min-h-screen bg-[#030712] text-foreground">
      {/* Background gradients */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute inset-x-[-20%] top-[-30%] h-[40rem] rounded-full bg-gradient-to-br from-blue-600/20 via-sky-500/10 to-purple-600/5 blur-3xl" />
        <div className="absolute inset-x-[30%] top-[20%] h-[30rem] rounded-full bg-gradient-to-br from-cyan-400/10 via-sky-500/10 to-transparent blur-[160px]" />
      </div>

      <SiteHeader
        showDownload={false}
      />

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-white">Tasks</h1>
          <p className="mt-2 text-sm text-neutral-400">
            View and manage your AI coding tasks across all categories
          </p>
        </div>

        <div className="space-y-8">
          <TaskSection
            title="Workspaces"
            description="Cloud and local workspace environments"
            tasks={workspaceTasks}
            emptyMessage="No workspace tasks"
            teamSlugOrId={teamSlugOrId}
          />

          <TaskSection
            title="Ready to review"
            description="Tasks with open pull requests awaiting review"
            tasks={readyToReviewTasks}
            emptyMessage="No tasks ready for review"
            teamSlugOrId={teamSlugOrId}
          />

          <TaskSection
            title="In progress"
            description="Tasks currently being worked on"
            tasks={inProgressTasks}
            emptyMessage="No tasks in progress"
            teamSlugOrId={teamSlugOrId}
          />

          <TaskSection
            title="Merged"
            description="Successfully merged tasks"
            tasks={mergedTasks}
            emptyMessage="No merged tasks"
            teamSlugOrId={teamSlugOrId}
          />
        </div>
      </main>
    </div>
  );
}
