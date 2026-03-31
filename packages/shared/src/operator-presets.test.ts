import { describe, it, expect } from "vitest";
import {
  BUILTIN_PRESETS,
  BUILTIN_PRESET_IDS,
  getBuiltinPreset,
  isBuiltinPresetId,
  mergePresetsWithBuiltins,
  applyPresetToSpawnOptions,
  type OperatorPreset,
} from "./operator-presets";

describe("operator-presets", () => {
  describe("BUILTIN_PRESETS", () => {
    it("has 4 built-in presets", () => {
      expect(BUILTIN_PRESETS).toHaveLength(4);
    });

    it("all built-in presets have required fields", () => {
      for (const preset of BUILTIN_PRESETS) {
        expect(preset.id).toBeTruthy();
        expect(preset.name).toBeTruthy();
        expect(preset.description).toBeTruthy();
        expect(preset.icon).toBeTruthy();
        expect(typeof preset.priority).toBe("number");
        expect(preset.isBuiltin).toBe(true);
      }
    });

    it("built-in presets have valid task classes", () => {
      const validTaskClasses = [
        "routine",
        "deep-coding",
        "review",
        "eval",
        "architecture",
        "large-context",
      ];
      for (const preset of BUILTIN_PRESETS) {
        if (preset.taskClass) {
          expect(validTaskClasses).toContain(preset.taskClass);
        }
      }
    });
  });

  describe("getBuiltinPreset", () => {
    it("returns preset for valid ID", () => {
      const preset = getBuiltinPreset("quick");
      expect(preset).toBeDefined();
      expect(preset?.name).toBe("Quick Task");
    });

    it("returns undefined for invalid ID", () => {
      const preset = getBuiltinPreset("nonexistent" as never);
      expect(preset).toBeUndefined();
    });
  });

  describe("isBuiltinPresetId", () => {
    it("returns true for built-in IDs", () => {
      for (const id of BUILTIN_PRESET_IDS) {
        expect(isBuiltinPresetId(id)).toBe(true);
      }
    });

    it("returns false for custom IDs", () => {
      expect(isBuiltinPresetId("custom-preset")).toBe(false);
      expect(isBuiltinPresetId("")).toBe(false);
    });
  });

  describe("mergePresetsWithBuiltins", () => {
    it("returns all built-ins when custom is empty", () => {
      const result = mergePresetsWithBuiltins([]);
      expect(result).toHaveLength(BUILTIN_PRESETS.length);
    });

    it("adds custom presets after built-ins", () => {
      const custom: OperatorPreset = {
        id: "my-preset",
        name: "My Preset",
        description: "Custom",
        icon: "star",
        priority: 5,
        isBuiltin: false,
      };
      const result = mergePresetsWithBuiltins([custom]);
      expect(result).toHaveLength(BUILTIN_PRESETS.length + 1);
      expect(result[result.length - 1].id).toBe("my-preset");
    });

    it("overrides built-in with custom of same ID", () => {
      const override: OperatorPreset = {
        id: "quick", // Same as built-in
        name: "My Quick",
        description: "Custom quick",
        icon: "bolt",
        priority: 1,
        isBuiltin: false,
      };
      const result = mergePresetsWithBuiltins([override]);
      // Should have 3 built-ins (minus quick) + 1 custom
      expect(result).toHaveLength(BUILTIN_PRESETS.length);
      const quickPreset = result.find((p) => p.id === "quick");
      expect(quickPreset?.name).toBe("My Quick");
    });
  });

  describe("applyPresetToSpawnOptions", () => {
    it("extracts spawn options from preset", () => {
      const preset: OperatorPreset = {
        id: "test",
        name: "Test",
        description: "Test preset",
        icon: "test",
        taskClass: "architecture",
        agentName: "claude/opus-4.6",
        selectedVariant: "max",
        supervisorProfileId: "profile-123",
        priority: 2,
        isBuiltin: false,
      };

      const options = applyPresetToSpawnOptions(preset);

      expect(options.taskClass).toBe("architecture");
      expect(options.agentName).toBe("claude/opus-4.6");
      expect(options.selectedVariant).toBe("max");
      expect(options.supervisorProfileId).toBe("profile-123");
      expect(options.priority).toBe(2);
    });

    it("handles preset with minimal fields", () => {
      const preset: OperatorPreset = {
        id: "minimal",
        name: "Minimal",
        description: "",
        icon: "box",
        priority: 5,
        isBuiltin: false,
      };

      const options = applyPresetToSpawnOptions(preset);

      expect(options.taskClass).toBeUndefined();
      expect(options.agentName).toBeUndefined();
      expect(options.selectedVariant).toBeUndefined();
      expect(options.supervisorProfileId).toBeUndefined();
      expect(options.priority).toBe(5);
    });
  });
});
