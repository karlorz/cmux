import { describe, expect, it } from "vitest";
import { getPlatformAiModelIdForService } from "@cmux/shared";
import {
  getDefaultHeatmapModelConfig,
  getHeatmapModelConfigForSelection,
  HEATMAP_MODEL_ANTHROPIC_HAIKU_45_QUERY_VALUE,
  HEATMAP_MODEL_OPENAI_GPT_5_NANO_QUERY_VALUE,
  normalizeHeatmapModelQueryValue,
  parseModelConfigFromUrlSearchParams,
} from "./model-config";

describe("model-config", () => {
  it("defaults review config to low-tier anthropic", () => {
    expect(getDefaultHeatmapModelConfig()).toEqual({
      provider: "anthropic",
      model: getPlatformAiModelIdForService("review", "anthropic"),
    });
  });

  it("resolves canonical openai selection to gpt-5-nano", () => {
    expect(
      getHeatmapModelConfigForSelection(HEATMAP_MODEL_OPENAI_GPT_5_NANO_QUERY_VALUE)
    ).toEqual({
      provider: "openai",
      model: getPlatformAiModelIdForService("review", "openai"),
    });
  });

  it("aliases deprecated openai heatmap values to the canonical selection", () => {
    expect(normalizeHeatmapModelQueryValue("finetune")).toBe(
      HEATMAP_MODEL_OPENAI_GPT_5_NANO_QUERY_VALUE
    );
    expect(normalizeHeatmapModelQueryValue("cmux-heatmap-1")).toBe(
      HEATMAP_MODEL_OPENAI_GPT_5_NANO_QUERY_VALUE
    );
    expect(normalizeHeatmapModelQueryValue("cmux-heatmap-2")).toBe(
      HEATMAP_MODEL_OPENAI_GPT_5_NANO_QUERY_VALUE
    );
  });

  it("aliases legacy anthropic values to haiku 4.5", () => {
    expect(normalizeHeatmapModelQueryValue("anthropic")).toBe(
      HEATMAP_MODEL_ANTHROPIC_HAIKU_45_QUERY_VALUE
    );
    expect(normalizeHeatmapModelQueryValue("anthropic-opus-4-5")).toBe(
      HEATMAP_MODEL_ANTHROPIC_HAIKU_45_QUERY_VALUE
    );
  });

  it("parses legacy ft query params as openai gpt-5-nano", () => {
    const searchParams = new URLSearchParams();
    searchParams.set("ft0", "1");

    expect(parseModelConfigFromUrlSearchParams(searchParams)).toEqual({
      provider: "openai",
      model: getPlatformAiModelIdForService("review", "openai"),
    });
  });
});
