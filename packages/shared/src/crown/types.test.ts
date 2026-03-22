import { describe, expect, it } from "vitest";
import {
  WorkerRunStatusSchema,
  WorkerRunContextSchema,
  CrownEvaluationStatusSchema,
  CrownWorkerCheckResponseSchema,
  WorkerTaskRunDescriptorSchema,
  WorkerTaskRunResponseSchema,
} from "./types";

describe("crown/types schemas", () => {
  describe("WorkerRunStatusSchema", () => {
    it("accepts 'pending'", () => {
      expect(WorkerRunStatusSchema.safeParse("pending").success).toBe(true);
    });

    it("accepts 'running'", () => {
      expect(WorkerRunStatusSchema.safeParse("running").success).toBe(true);
    });

    it("accepts 'completed'", () => {
      expect(WorkerRunStatusSchema.safeParse("completed").success).toBe(true);
    });

    it("accepts 'failed'", () => {
      expect(WorkerRunStatusSchema.safeParse("failed").success).toBe(true);
    });

    it("rejects invalid status", () => {
      expect(WorkerRunStatusSchema.safeParse("unknown").success).toBe(false);
    });
  });

  describe("WorkerRunContextSchema", () => {
    const validContext = {
      token: "test-token",
      prompt: "Fix the bug",
    };

    it("accepts minimal valid context", () => {
      const result = WorkerRunContextSchema.safeParse(validContext);
      expect(result.success).toBe(true);
    });

    it("accepts context with all optional fields", () => {
      const result = WorkerRunContextSchema.safeParse({
        ...validContext,
        agentModel: "claude/opus-4.5",
        teamId: "team-123",
        taskId: "task-456",
        convexUrl: "https://convex.dev",
      });
      expect(result.success).toBe(true);
    });

    it("rejects context without token", () => {
      const result = WorkerRunContextSchema.safeParse({
        prompt: "Fix the bug",
      });
      expect(result.success).toBe(false);
    });

    it("rejects context without prompt", () => {
      const result = WorkerRunContextSchema.safeParse({
        token: "test-token",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("CrownEvaluationStatusSchema", () => {
    it("accepts all valid statuses", () => {
      const validStatuses = ["pending", "in_progress", "succeeded", "error"];
      for (const status of validStatuses) {
        expect(CrownEvaluationStatusSchema.safeParse(status).success).toBe(true);
      }
    });

    it("rejects invalid status", () => {
      expect(CrownEvaluationStatusSchema.safeParse("invalid").success).toBe(false);
    });
  });

  describe("CrownWorkerCheckResponseSchema", () => {
    const validResponse = {
      ok: true,
      taskId: "task-123",
      allRunsFinished: false,
      shouldEvaluate: false,
      singleRunWinnerId: null,
      existingEvaluation: null,
      task: {
        text: "Implement feature",
        crownEvaluationStatus: null,
        crownEvaluationError: null,
        isCompleted: false,
        baseBranch: "main",
        projectFullName: "org/repo",
        autoPrEnabled: true,
      },
      runs: [],
    };

    it("accepts valid response", () => {
      const result = CrownWorkerCheckResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it("accepts response with runs", () => {
      const result = CrownWorkerCheckResponseSchema.safeParse({
        ...validResponse,
        runs: [
          {
            id: "run-1",
            status: "completed",
            agentName: "claude/opus-4.5",
            newBranch: "feature-branch",
            exitCode: 0,
            completedAt: Date.now(),
          },
          {
            id: "run-2",
            status: "running",
            agentName: null,
            newBranch: null,
            exitCode: null,
            completedAt: null,
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("accepts response with existing evaluation", () => {
      const result = CrownWorkerCheckResponseSchema.safeParse({
        ...validResponse,
        existingEvaluation: {
          winnerRunId: "run-1",
          evaluatedAt: Date.now(),
        },
      });
      expect(result.success).toBe(true);
    });

    it("rejects response with ok: false", () => {
      const result = CrownWorkerCheckResponseSchema.safeParse({
        ...validResponse,
        ok: false,
      });
      expect(result.success).toBe(false);
    });

    it("rejects response with invalid run status", () => {
      const result = CrownWorkerCheckResponseSchema.safeParse({
        ...validResponse,
        runs: [
          {
            id: "run-1",
            status: "invalid-status",
            agentName: null,
            newBranch: null,
            exitCode: null,
            completedAt: null,
          },
        ],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("WorkerTaskRunDescriptorSchema", () => {
    const validDescriptor = {
      id: "run-123",
      taskId: "task-456",
      teamId: "team-789",
      newBranch: null,
      agentName: null,
    };

    it("accepts valid descriptor", () => {
      const result = WorkerTaskRunDescriptorSchema.safeParse(validDescriptor);
      expect(result.success).toBe(true);
    });

    it("accepts descriptor with all fields populated", () => {
      const result = WorkerTaskRunDescriptorSchema.safeParse({
        ...validDescriptor,
        newBranch: "feature/my-branch",
        agentName: "claude/opus-4.5",
        isPreviewJob: true,
      });
      expect(result.success).toBe(true);
    });

    it("rejects descriptor missing required id", () => {
      const { id, ...withoutId } = validDescriptor;
      void id;
      const result = WorkerTaskRunDescriptorSchema.safeParse(withoutId);
      expect(result.success).toBe(false);
    });
  });

  describe("WorkerTaskRunResponseSchema", () => {
    it("accepts valid response with null taskRun", () => {
      const result = WorkerTaskRunResponseSchema.safeParse({
        ok: true,
        taskRun: null,
        task: null,
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid response with taskRun", () => {
      const result = WorkerTaskRunResponseSchema.safeParse({
        ok: true,
        taskRun: {
          id: "run-123",
          taskId: "task-456",
          teamId: "team-789",
          newBranch: "feature-branch",
          agentName: "claude/opus-4.5",
        },
        task: {
          id: "task-456",
          text: "Implement feature",
          projectFullName: "org/repo",
        },
        screenshotWorkflowEnabled: true,
      });
      expect(result.success).toBe(true);
    });

    it("accepts response with ok: false", () => {
      const result = WorkerTaskRunResponseSchema.safeParse({
        ok: false,
        taskRun: null,
        task: null,
      });
      expect(result.success).toBe(true);
    });

    it("rejects response without ok field", () => {
      const result = WorkerTaskRunResponseSchema.safeParse({
        taskRun: null,
        task: null,
      });
      expect(result.success).toBe(false);
    });
  });
});
