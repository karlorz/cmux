import { describe, expect, it } from "vitest";
import {
  generateProjectRecommendations,
  type ProjectForRecommendation,
} from "./project-recommendations";

const NOW = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;

function makeProject(overrides: Partial<ProjectForRecommendation> = {}): ProjectForRecommendation {
  return {
    id: "proj_1",
    name: "My Project",
    status: "active",
    updatedAt: NOW - DAY_MS, // 1 day ago (fresh)
    ...overrides,
  };
}

describe("generateProjectRecommendations", () => {
  it("returns empty array for empty input", () => {
    expect(generateProjectRecommendations([])).toEqual([]);
  });

  it("skips archived projects", () => {
    const project = makeProject({ status: "archived" });
    expect(generateProjectRecommendations([project])).toEqual([]);
  });

  it("skips completed projects", () => {
    const project = makeProject({ status: "completed" });
    expect(generateProjectRecommendations([project])).toEqual([]);
  });

  it("includes planning projects in recommendations", () => {
    const project = makeProject({ status: "planning", plan: null });
    const recs = generateProjectRecommendations([project]);
    expect(recs.some((r) => r.type === "no_plan")).toBe(true);
  });

  describe("stale_project", () => {
    it("flags active project with no activity for 8 days", () => {
      const project = makeProject({ updatedAt: NOW - 8 * DAY_MS });
      const recs = generateProjectRecommendations([project]);
      const stale = recs.find((r) => r.type === "stale_project");
      expect(stale).toBeDefined();
      expect(stale?.priority).toBe("high");
      expect(stale?.description).toContain("8 days");
      expect(stale?.projectId).toBe("proj_1");
    });

    it("does not flag active project updated 6 days ago", () => {
      const project = makeProject({ updatedAt: NOW - 6 * DAY_MS });
      const recs = generateProjectRecommendations([project]);
      expect(recs.find((r) => r.type === "stale_project")).toBeUndefined();
    });

    it("does not flag stale for planning-status projects", () => {
      const project = makeProject({ status: "planning", updatedAt: NOW - 10 * DAY_MS });
      const recs = generateProjectRecommendations([project]);
      expect(recs.find((r) => r.type === "stale_project")).toBeUndefined();
    });

    it("includes suggestedPrompt referencing the project name", () => {
      const project = makeProject({ name: "Auth Refactor", updatedAt: NOW - 10 * DAY_MS });
      const recs = generateProjectRecommendations([project]);
      const stale = recs.find((r) => r.type === "stale_project");
      expect(stale?.suggestedPrompt).toContain("Auth Refactor");
    });
  });

  describe("failed_tasks", () => {
    it("flags project with one failed task", () => {
      const project = makeProject({ failedTasks: 1 });
      const recs = generateProjectRecommendations([project]);
      const failed = recs.find((r) => r.type === "failed_tasks");
      expect(failed).toBeDefined();
      expect(failed?.priority).toBe("high");
      expect(failed?.description).toContain("1 failed task");
      expect(failed?.description).not.toContain("tasks");
    });

    it("uses plural form for multiple failed tasks", () => {
      const project = makeProject({ failedTasks: 3 });
      const recs = generateProjectRecommendations([project]);
      const failed = recs.find((r) => r.type === "failed_tasks");
      expect(failed?.description).toContain("3 failed tasks");
    });

    it("skips failed_tasks check when failedTasks is 0", () => {
      const project = makeProject({ failedTasks: 0 });
      const recs = generateProjectRecommendations([project]);
      expect(recs.find((r) => r.type === "failed_tasks")).toBeUndefined();
    });

    it("skips failed_tasks check when failedTasks is undefined", () => {
      const project = makeProject();
      const recs = generateProjectRecommendations([project]);
      expect(recs.find((r) => r.type === "failed_tasks")).toBeUndefined();
    });
  });

  describe("unstarted_plan", () => {
    it("flags project whose plan has all-pending tasks with no orchestration IDs", () => {
      const project = makeProject({
        plan: {
          tasks: [
            { status: "pending" },
            { status: "pending" },
          ],
        },
      });
      const recs = generateProjectRecommendations([project]);
      const unstarted = recs.find((r) => r.type === "unstarted_plan");
      expect(unstarted).toBeDefined();
      expect(unstarted?.priority).toBe("medium");
      expect(unstarted?.description).toContain("2 tasks");
    });

    it("uses singular form for one unstarted task", () => {
      const project = makeProject({
        plan: { tasks: [{ status: "pending" }] },
      });
      const recs = generateProjectRecommendations([project]);
      const unstarted = recs.find((r) => r.type === "unstarted_plan");
      expect(unstarted?.description).toContain("1 task");
      expect(unstarted?.description).not.toContain("tasks");
    });

    it("does not flag unstarted_plan when some tasks already have orchestration IDs", () => {
      const project = makeProject({
        plan: {
          tasks: [
            { status: "pending", orchestrationTaskId: "orch_1" },
            { status: "pending" },
          ],
        },
      });
      const recs = generateProjectRecommendations([project]);
      expect(recs.find((r) => r.type === "unstarted_plan")).toBeUndefined();
    });

    it("does not flag unstarted_plan when tasks are not all pending", () => {
      const project = makeProject({
        plan: {
          tasks: [
            { status: "completed" },
            { status: "pending" },
          ],
        },
      });
      const recs = generateProjectRecommendations([project]);
      expect(recs.find((r) => r.type === "unstarted_plan")).toBeUndefined();
    });
  });

  describe("no_plan", () => {
    it("flags project with null plan", () => {
      const project = makeProject({ plan: null });
      const recs = generateProjectRecommendations([project]);
      expect(recs.find((r) => r.type === "no_plan")).toBeDefined();
    });

    it("flags project with no plan field", () => {
      const project = makeProject({ plan: undefined });
      const recs = generateProjectRecommendations([project]);
      expect(recs.find((r) => r.type === "no_plan")).toBeDefined();
    });

    it("flags project with empty plan tasks array", () => {
      const project = makeProject({ plan: { tasks: [] } });
      const recs = generateProjectRecommendations([project]);
      expect(recs.find((r) => r.type === "no_plan")).toBeDefined();
    });
  });

  describe("priority sorting", () => {
    it("sorts high priority before medium priority", () => {
      const project = makeProject({
        failedTasks: 1, // high
        plan: { tasks: [{ status: "pending" }] }, // medium (unstarted_plan)
      });
      const recs = generateProjectRecommendations([project]);
      const highIdx = recs.findIndex((r) => r.priority === "high");
      const medIdx = recs.findIndex((r) => r.priority === "medium");
      expect(highIdx).toBeLessThan(medIdx);
    });

    it("multiple high-priority items all appear before medium items across projects", () => {
      const staleProject = makeProject({
        id: "proj_stale",
        name: "Stale",
        updatedAt: NOW - 10 * DAY_MS, // stale → high
        plan: null, // no_plan → medium
      });
      const failedProject = makeProject({
        id: "proj_failed",
        name: "Failed",
        failedTasks: 2, // failed → high
        plan: null, // no_plan → medium
      });
      const recs = generateProjectRecommendations([staleProject, failedProject]);
      const highItems = recs.filter((r) => r.priority === "high");
      const medItems = recs.filter((r) => r.priority === "medium");
      const lastHighIdx = recs.lastIndexOf(highItems[highItems.length - 1]);
      const firstMedIdx = recs.indexOf(medItems[0]);
      expect(lastHighIdx).toBeLessThan(firstMedIdx);
    });
  });

  describe("source and projectId fields", () => {
    it("sets source to project name and projectId to project id", () => {
      const project = makeProject({ id: "proj_abc", name: "DataPipeline" });
      const recs = generateProjectRecommendations([project]);
      for (const rec of recs) {
        expect(rec.source).toBe("DataPipeline");
        expect(rec.projectId).toBe("proj_abc");
      }
    });
  });
});
