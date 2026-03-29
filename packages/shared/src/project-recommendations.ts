/**
 * Project-State Recommendations Generator
 *
 * Generates recommended actions from cmux project data without requiring
 * an Obsidian vault. This provides useful recommendations even when no
 * vault is configured.
 *
 * Recommendation types:
 * - stale_project: Active project with no activity in 7+ days
 * - failed_tasks: Project has failed task runs
 * - unstarted_plan: Project has plan but hasn't dispatched
 * - no_plan: Active project with no plan defined
 */

// Thresholds (hardcoded sensible defaults)
const STALE_THRESHOLD_DAYS = 7;
const STALE_THRESHOLD_MS = STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

/**
 * Project data needed for recommendation generation.
 * Matches the shape returned by listProjectsForRecommendations internal query.
 */
export interface ProjectForRecommendation {
  id: string;
  name: string;
  status: string;
  updatedAt: number;
  totalTasks?: number;
  completedTasks?: number;
  failedTasks?: number;
  plan?: {
    tasks: Array<{
      status: string;
      orchestrationTaskId?: string;
    }>;
  } | null;
  githubProjectId?: string | null;
  githubProjectUrl?: string | null;
}

/**
 * Recommended action type from project state.
 * Compatible with the vault RecommendedAction type.
 */
export interface ProjectRecommendedAction {
  type: "stale_project" | "failed_tasks" | "unstarted_plan" | "no_plan";
  source: string;
  description: string;
  priority: "high" | "medium" | "low";
  suggestedPrompt?: string;
  projectId: string;
}

/**
 * Generate recommendations from project state.
 *
 * @param projects Array of projects to analyze
 * @returns Array of recommendations sorted by priority
 */
export function generateProjectRecommendations(
  projects: ProjectForRecommendation[]
): ProjectRecommendedAction[] {
  const recommendations: ProjectRecommendedAction[] = [];
  const now = Date.now();

  for (const project of projects) {
    // Skip non-active/non-planning projects
    if (project.status !== "active" && project.status !== "planning") {
      continue;
    }

    // Check for stale project (active projects only)
    if (project.status === "active") {
      const ageMs = now - project.updatedAt;
      if (ageMs > STALE_THRESHOLD_MS) {
        const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
        recommendations.push({
          type: "stale_project",
          source: project.name,
          description: `Project "${project.name}" has had no activity for ${ageDays} days.`,
          priority: "high",
          suggestedPrompt: `Review project "${project.name}" which has had no activity for ${ageDays} days. Check if it should be paused, completed, or needs attention.`,
          projectId: project.id,
        });
      }
    }

    // Check for failed tasks
    if ((project.failedTasks ?? 0) > 0) {
      const failedCount = project.failedTasks ?? 0;
      recommendations.push({
        type: "failed_tasks",
        source: project.name,
        description: `Project "${project.name}" has ${failedCount} failed task${failedCount === 1 ? "" : "s"}.`,
        priority: "high",
        suggestedPrompt: `Investigate the ${failedCount} failed task${failedCount === 1 ? "" : "s"} in project "${project.name}". Review error logs and retry or fix the issues.`,
        projectId: project.id,
      });
    }

    // Check for unstarted plan
    if (project.plan?.tasks && project.plan.tasks.length > 0) {
      const allPending = project.plan.tasks.every((t) => t.status === "pending");
      const noneDispatched = project.plan.tasks.every((t) => !t.orchestrationTaskId);

      if (allPending && noneDispatched) {
        const taskCount = project.plan.tasks.length;
        recommendations.push({
          type: "unstarted_plan",
          source: project.name,
          description: `Project "${project.name}" has a plan with ${taskCount} task${taskCount === 1 ? "" : "s"} but hasn't been dispatched.`,
          priority: "medium",
          suggestedPrompt: `Dispatch the plan for project "${project.name}" which has ${taskCount} pending task${taskCount === 1 ? "" : "s"} ready to run.`,
          projectId: project.id,
        });
      }
    } else {
      // No plan at all
      recommendations.push({
        type: "no_plan",
        source: project.name,
        description: `Project "${project.name}" has no plan defined.`,
        priority: "medium",
        suggestedPrompt: `Create a plan for project "${project.name}" to organize and track the work.`,
        projectId: project.id,
      });
    }
  }

  // Sort by priority (high > medium > low)
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  recommendations.sort(
    (a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2)
  );

  return recommendations;
}
