import { describe, expect, it } from "vitest";
import {
  modalTemplateVersionSchema,
  modalTemplatePresetSchema,
  modalTemplateManifestSchema,
  MODAL_TEMPLATE_MANIFEST,
  MODAL_TEMPLATE_PRESETS,
  DEFAULT_MODAL_TEMPLATE_ID,
  DEFAULT_MODAL_SIZE_TIER,
  getModalTemplateByTier,
  parsePresetCpu,
  parsePresetMemoryMiB,
  getModalTemplateByPresetId,
  getModalGpuTemplates,
  MODAL_AVAILABLE_GPUS,
  isModalGpuGated,
} from "./modal-templates";

describe("modal-templates", () => {
  describe("modalTemplateVersionSchema", () => {
    it("accepts valid version", () => {
      const result = modalTemplateVersionSchema.safeParse({
        version: 1,
        capturedAt: "2026-03-01T00:00:00Z",
      });
      expect(result.success).toBe(true);
    });

    it("rejects non-positive version", () => {
      const result = modalTemplateVersionSchema.safeParse({
        version: 0,
        capturedAt: "2026-03-01T00:00:00Z",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid date string", () => {
      const result = modalTemplateVersionSchema.safeParse({
        version: 1,
        capturedAt: "not-a-date",
      });
      expect(result.success).toBe(false);
    });

    it("accepts various ISO date formats", () => {
      const dates = [
        "2026-03-01",
        "2026-03-01T12:00:00Z",
        "2026-03-01T12:00:00.000Z",
        "2026-03-01T12:00:00+00:00",
      ];
      for (const capturedAt of dates) {
        const result = modalTemplateVersionSchema.safeParse({
          version: 1,
          capturedAt,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe("modalTemplatePresetSchema", () => {
    it("accepts valid preset", () => {
      const result = modalTemplatePresetSchema.safeParse({
        templateId: "test-template",
        label: "Test Template",
        cpu: "4 vCPU",
        memory: "16 GB RAM",
        disk: "100 GB",
        image: "ubuntu:22.04",
        versions: [{ version: 1, capturedAt: "2026-03-01T00:00:00Z" }],
      });
      expect(result.success).toBe(true);
    });

    it("accepts preset with optional fields", () => {
      const result = modalTemplatePresetSchema.safeParse({
        templateId: "gpu-template",
        label: "GPU Template",
        cpu: "8 vCPU",
        memory: "32 GB RAM",
        disk: "200 GB",
        gpu: "A100",
        image: "nvidia/cuda:12.0",
        description: "High-performance GPU template",
        useCases: ["ML training", "Inference"],
        versions: [
          { version: 1, capturedAt: "2026-01-01T00:00:00Z" },
          { version: 2, capturedAt: "2026-02-01T00:00:00Z" },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("rejects preset without versions", () => {
      const result = modalTemplatePresetSchema.safeParse({
        templateId: "no-versions",
        label: "No Versions",
        cpu: "4 vCPU",
        memory: "16 GB RAM",
        disk: "100 GB",
        image: "ubuntu:22.04",
        versions: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects preset with duplicate version numbers", () => {
      const result = modalTemplatePresetSchema.safeParse({
        templateId: "bad-versions",
        label: "Bad Versions",
        cpu: "4 vCPU",
        memory: "16 GB RAM",
        disk: "100 GB",
        image: "ubuntu:22.04",
        versions: [
          { version: 1, capturedAt: "2026-01-01T00:00:00Z" },
          { version: 1, capturedAt: "2026-02-01T00:00:00Z" },
        ],
      });
      expect(result.success).toBe(false);
    });

    it("accepts versions in any order (sorts automatically)", () => {
      const result = modalTemplatePresetSchema.safeParse({
        templateId: "reverse-order",
        label: "Reverse Order",
        cpu: "4 vCPU",
        memory: "16 GB RAM",
        disk: "100 GB",
        image: "ubuntu:22.04",
        versions: [
          { version: 2, capturedAt: "2026-02-01T00:00:00Z" },
          { version: 1, capturedAt: "2026-01-01T00:00:00Z" },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("modalTemplateManifestSchema", () => {
    it("accepts valid manifest", () => {
      const result = modalTemplateManifestSchema.safeParse({
        schemaVersion: 1,
        updatedAt: "2026-03-01T00:00:00Z",
        templates: [
          {
            templateId: "test",
            label: "Test",
            cpu: "4 vCPU",
            memory: "16 GB RAM",
            disk: "100 GB",
            image: "ubuntu:22.04",
            versions: [{ version: 1, capturedAt: "2026-03-01T00:00:00Z" }],
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("rejects manifest without templates", () => {
      const result = modalTemplateManifestSchema.safeParse({
        schemaVersion: 1,
        updatedAt: "2026-03-01T00:00:00Z",
        templates: [],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("MODAL_TEMPLATE_MANIFEST", () => {
    it("is valid and non-empty", () => {
      expect(MODAL_TEMPLATE_MANIFEST).toBeDefined();
      expect(MODAL_TEMPLATE_MANIFEST.schemaVersion).toBeGreaterThan(0);
      expect(MODAL_TEMPLATE_MANIFEST.templates.length).toBeGreaterThan(0);
    });
  });

  describe("MODAL_TEMPLATE_PRESETS", () => {
    it("has at least one template", () => {
      expect(MODAL_TEMPLATE_PRESETS.length).toBeGreaterThan(0);
    });

    it("includes the default template", () => {
      const defaultTemplate = MODAL_TEMPLATE_PRESETS.find(
        (p) => p.templateId === DEFAULT_MODAL_TEMPLATE_ID
      );
      expect(defaultTemplate).toBeDefined();
    });
  });

  describe("DEFAULT_MODAL_SIZE_TIER", () => {
    it("is 'high'", () => {
      expect(DEFAULT_MODAL_SIZE_TIER).toBe("high");
    });
  });

  describe("getModalTemplateByTier", () => {
    it("returns template for 'low' tier", () => {
      const template = getModalTemplateByTier("low");
      expect(template).toBeDefined();
      expect(template?.templateId).toBe("cmux-devbox-low");
    });

    it("returns template for 'mid' tier", () => {
      const template = getModalTemplateByTier("mid");
      expect(template).toBeDefined();
      expect(template?.templateId).toBe("cmux-devbox-mid");
    });

    it("returns template for 'high' tier", () => {
      const template = getModalTemplateByTier("high");
      expect(template).toBeDefined();
      expect(template?.templateId).toBe("cmux-devbox-gpu");
    });
  });

  describe("parsePresetCpu", () => {
    it("parses '4 vCPU' correctly", () => {
      expect(parsePresetCpu("4 vCPU")).toBe(4);
    });

    it("parses '8 vcpu' (lowercase) correctly", () => {
      expect(parsePresetCpu("8 vcpu")).toBe(8);
    });

    it("parses '2.5 vCPU' (decimal) correctly", () => {
      expect(parsePresetCpu("2.5 vCPU")).toBe(2.5);
    });

    it("parses '16vCPU' (no space) correctly", () => {
      expect(parsePresetCpu("16vCPU")).toBe(16);
    });

    it("parses '4 CPU' (no v prefix) correctly", () => {
      expect(parsePresetCpu("4 CPU")).toBe(4);
    });

    it("returns undefined for undefined input", () => {
      expect(parsePresetCpu(undefined)).toBeUndefined();
    });

    it("returns undefined for invalid format", () => {
      expect(parsePresetCpu("invalid")).toBeUndefined();
    });
  });

  describe("parsePresetMemoryMiB", () => {
    it("parses '16 GB RAM' correctly", () => {
      expect(parsePresetMemoryMiB("16 GB RAM")).toBe(16384);
    });

    it("parses '32 gb' (lowercase) correctly", () => {
      expect(parsePresetMemoryMiB("32 gb")).toBe(32768);
    });

    it("parses '8GB' (no space) correctly", () => {
      expect(parsePresetMemoryMiB("8GB")).toBe(8192);
    });

    it("parses '0.5 GB' (decimal) correctly", () => {
      expect(parsePresetMemoryMiB("0.5 GB")).toBe(512);
    });

    it("returns undefined for undefined input", () => {
      expect(parsePresetMemoryMiB(undefined)).toBeUndefined();
    });

    it("returns undefined for invalid format", () => {
      expect(parsePresetMemoryMiB("invalid")).toBeUndefined();
    });
  });

  describe("getModalTemplateByPresetId", () => {
    it("returns template for valid preset ID", () => {
      const template = getModalTemplateByPresetId("cmux-devbox-gpu");
      expect(template).toBeDefined();
      expect(template?.templateId).toBe("cmux-devbox-gpu");
    });

    it("returns undefined for invalid preset ID", () => {
      const template = getModalTemplateByPresetId("non-existent-id");
      expect(template).toBeUndefined();
    });
  });

  describe("getModalGpuTemplates", () => {
    it("returns only GPU-enabled templates", () => {
      const gpuTemplates = getModalGpuTemplates();
      for (const template of gpuTemplates) {
        expect(template.gpu).toBeDefined();
      }
    });

    it("returns at least one GPU template", () => {
      const gpuTemplates = getModalGpuTemplates();
      expect(gpuTemplates.length).toBeGreaterThan(0);
    });
  });

  describe("MODAL_AVAILABLE_GPUS", () => {
    it("contains expected GPU types", () => {
      expect(MODAL_AVAILABLE_GPUS.has("T4")).toBe(true);
      expect(MODAL_AVAILABLE_GPUS.has("A100")).toBe(true);
      expect(MODAL_AVAILABLE_GPUS.has("H100")).toBe(true);
    });
  });

  describe("isModalGpuGated", () => {
    it("returns false for available GPUs", () => {
      expect(isModalGpuGated("T4")).toBe(false);
      expect(isModalGpuGated("A100")).toBe(false);
      expect(isModalGpuGated("H100")).toBe(false);
    });

    it("returns false for available GPUs (case insensitive)", () => {
      expect(isModalGpuGated("t4")).toBe(false);
      expect(isModalGpuGated("a100")).toBe(false);
    });

    it("returns false for multi-GPU syntax", () => {
      expect(isModalGpuGated("H100:2")).toBe(false);
      expect(isModalGpuGated("A100:4")).toBe(false);
    });

    it("returns true for unknown GPU types", () => {
      expect(isModalGpuGated("UNKNOWN_GPU")).toBe(true);
      expect(isModalGpuGated("FUTURE_GPU:8")).toBe(true);
    });
  });
});
