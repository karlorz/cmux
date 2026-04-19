import { describe, expect, it } from "vitest";
import {
  TASK_CLASSES,
  TASK_CLASS_MAPPINGS,
  getTaskClassMapping,
  getAllTaskClassMappings,
  isValidTaskClass,
  resolveModelForTaskClass,
  getRecommendedTaskClassForModel,
  type TaskClass,
} from "./task-class-routing";

describe("task-class-routing", () => {
  describe("TASK_CLASSES", () => {
    it("should have all expected task classes", () => {
      expect(TASK_CLASSES).toContain("routine");
      expect(TASK_CLASSES).toContain("deep-coding");
      expect(TASK_CLASSES).toContain("review");
      expect(TASK_CLASSES).toContain("eval");
      expect(TASK_CLASSES).toContain("architecture");
      expect(TASK_CLASSES).toContain("large-context");
      expect(TASK_CLASSES).toHaveLength(6);
    });
  });

  describe("TASK_CLASS_MAPPINGS", () => {
    it("should have a mapping for each task class", () => {
      expect(TASK_CLASS_MAPPINGS).toHaveLength(6);
      for (const taskClass of TASK_CLASSES) {
        const mapping = TASK_CLASS_MAPPINGS.find(
          (m) => m.taskClass === taskClass
        );
        expect(mapping).toBeDefined();
        expect(mapping?.displayName).toBeTruthy();
        expect(mapping?.description).toBeTruthy();
        expect(mapping?.defaultModels).toBeInstanceOf(Array);
        expect(mapping?.escalationModels).toBeInstanceOf(Array);
      }
    });

    it("should have at least one default model per mapping", () => {
      for (const mapping of TASK_CLASS_MAPPINGS) {
        expect(mapping.defaultModels.length).toBeGreaterThan(0);
      }
    });
  });

  describe("getTaskClassMapping", () => {
    it("should return mapping for valid task class", () => {
      const mapping = getTaskClassMapping("routine");
      expect(mapping).toBeDefined();
      expect(mapping?.taskClass).toBe("routine");
      expect(mapping?.displayName).toBe("Routine");
    });

    it("should return undefined for invalid task class", () => {
      // @ts-expect-error - testing invalid input
      const mapping = getTaskClassMapping("invalid");
      expect(mapping).toBeUndefined();
    });
  });

  describe("getAllTaskClassMappings", () => {
    it("should return all mappings", () => {
      const mappings = getAllTaskClassMappings();
      expect(mappings).toEqual(TASK_CLASS_MAPPINGS);
      expect(mappings).toHaveLength(6);
    });
  });

  describe("isValidTaskClass", () => {
    it("should return true for valid task classes", () => {
      expect(isValidTaskClass("routine")).toBe(true);
      expect(isValidTaskClass("deep-coding")).toBe(true);
      expect(isValidTaskClass("architecture")).toBe(true);
    });

    it("should return false for invalid task classes", () => {
      expect(isValidTaskClass("invalid")).toBe(false);
      expect(isValidTaskClass("")).toBe(false);
      expect(isValidTaskClass("ROUTINE")).toBe(false);
    });
  });

  describe("resolveModelForTaskClass", () => {
    it("should return first available default model", () => {
      const result = resolveModelForTaskClass("routine", [
        "claude/sonnet-4.5",
        "codex/gpt-5.4-mini",
      ]);
      expect(result).not.toBeNull();
      expect(result?.agentName).toBe("codex/gpt-5.4-mini");
      expect(result?.wasEscalated).toBe(false);
    });

    it("should use escalation model when defaults unavailable", () => {
      const result = resolveModelForTaskClass("routine", [
        "claude/opus-4.5", // This is an escalation model for routine
      ]);
      expect(result).not.toBeNull();
      expect(result?.agentName).toBe("claude/opus-4.5");
      expect(result?.wasEscalated).toBe(true);
    });

    it("should return null when no models available", () => {
      const result = resolveModelForTaskClass("routine", []);
      expect(result).toBeNull();
    });

    it("should return null when only unrelated models available", () => {
      const result = resolveModelForTaskClass("routine", [
        "some/unknown-model",
        "another/model",
      ]);
      expect(result).toBeNull();
    });

    it("should apply default variant from mapping", () => {
      const result = resolveModelForTaskClass("architecture", [
        "claude/opus-4.7",
      ]);
      expect(result).not.toBeNull();
      expect(result?.agentName).toBe("claude/opus-4.7");
      expect(result?.selectedVariant).toBe("max");
    });

    it("should prefer first default model over later ones", () => {
      // routine's first default is codex/gpt-5.4-mini
      const result = resolveModelForTaskClass("routine", [
        "claude/sonnet-4.5", // second default
        "codex/gpt-5.4-mini", // first default
      ]);
      expect(result?.agentName).toBe("codex/gpt-5.4-mini");
    });

    it("should handle large-context class with Gemini", () => {
      const result = resolveModelForTaskClass("large-context", [
        "gemini/2.5-pro",
      ]);
      expect(result).not.toBeNull();
      expect(result?.agentName).toBe("gemini/2.5-pro");
    });

    it("should handle eval class with flash models", () => {
      const result = resolveModelForTaskClass("eval", [
        "gemini/2.5-flash",
        "claude/haiku-4.5",
      ]);
      expect(result?.agentName).toBe("gemini/2.5-flash");
    });
  });

  describe("getRecommendedTaskClassForModel", () => {
    it("should return task class for default model", () => {
      expect(getRecommendedTaskClassForModel("claude/opus-4.7")).toBe(
        "architecture"
      );
      expect(getRecommendedTaskClassForModel("gemini/2.5-flash")).toBe("eval");
      expect(getRecommendedTaskClassForModel("gemini/2.5-pro")).toBe(
        "large-context"
      );
    });

    it("should return first matching task class when model appears in multiple", () => {
      // claude/haiku-4.5 appears in both review and eval defaults
      const result = getRecommendedTaskClassForModel("claude/haiku-4.5");
      expect(["review", "eval"]).toContain(result);
    });

    it("should return undefined for unknown model", () => {
      expect(getRecommendedTaskClassForModel("unknown/model")).toBeUndefined();
    });

    it("should not return task class for escalation-only models", () => {
      // claude/opus-4.7 is a default for architecture, not just escalation
      expect(getRecommendedTaskClassForModel("claude/opus-4.7")).toBe(
        "architecture"
      );
    });
  });

  describe("task class mapping consistency", () => {
    it("should not have duplicate task classes", () => {
      const taskClasses = TASK_CLASS_MAPPINGS.map((m) => m.taskClass);
      const uniqueClasses = new Set(taskClasses);
      expect(uniqueClasses.size).toBe(taskClasses.length);
    });

    it("should have valid model names format", () => {
      for (const mapping of TASK_CLASS_MAPPINGS) {
        for (const model of [
          ...mapping.defaultModels,
          ...mapping.escalationModels,
        ]) {
          // Model names should follow provider/model-name format
          expect(model).toMatch(/^[a-z]+\/[a-z0-9.-]+$/);
        }
      }
    });

    it("should have valid variants only for models that support them", () => {
      // Architecture has max variant - Opus 4.7 supports it
      const archMapping = getTaskClassMapping("architecture");
      expect(archMapping?.defaultVariant).toBe("max");
      expect(archMapping?.defaultModels).toContain("claude/opus-4.7");

      // Deep-coding has high variant
      const deepMapping = getTaskClassMapping("deep-coding");
      expect(deepMapping?.defaultVariant).toBe("high");
    });
  });
});
