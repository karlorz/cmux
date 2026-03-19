import { describe, expect, it } from "vitest";
import {
  QWEN_AGENT_CONFIGS,
  QWEN_OPENROUTER_CODER_FREE_CONFIG,
  QWEN_MODEL_STUDIO_CODER_PLUS_CONFIG,
} from "./configs";
import { MODEL_STUDIO_API_KEY, OPENROUTER_API_KEY } from "../../apiKeys";

describe("QWEN_AGENT_CONFIGS", () => {
  it("contains both qwen configs", () => {
    expect(QWEN_AGENT_CONFIGS).toContain(QWEN_OPENROUTER_CODER_FREE_CONFIG);
    expect(QWEN_AGENT_CONFIGS).toContain(QWEN_MODEL_STUDIO_CODER_PLUS_CONFIG);
    expect(QWEN_AGENT_CONFIGS).toHaveLength(2);
  });
});

describe("QWEN_OPENROUTER_CODER_FREE_CONFIG", () => {
  it("has name qwen/qwen3-coder:free", () => {
    expect(QWEN_OPENROUTER_CODER_FREE_CONFIG.name).toBe("qwen/qwen3-coder:free");
  });

  it("uses qwen command", () => {
    expect(QWEN_OPENROUTER_CODER_FREE_CONFIG.command).toBe("qwen");
  });

  it("has --model and --yolo args", () => {
    expect(QWEN_OPENROUTER_CODER_FREE_CONFIG.args).toContain("--model");
    expect(QWEN_OPENROUTER_CODER_FREE_CONFIG.args).toContain("--yolo");
  });

  it("has telemetry args", () => {
    expect(QWEN_OPENROUTER_CODER_FREE_CONFIG.args).toContain("--telemetry");
    expect(QWEN_OPENROUTER_CODER_FREE_CONFIG.args).toContain(
      "--telemetry-target=local"
    );
    expect(QWEN_OPENROUTER_CODER_FREE_CONFIG.args).toContain(
      "--telemetry-log-prompts"
    );
  });

  it("has OPENROUTER_API_KEY mapped to OPENAI_API_KEY", () => {
    const apiKey = QWEN_OPENROUTER_CODER_FREE_CONFIG.apiKeys?.find(
      (k) =>
        typeof k === "object" &&
        "envVar" in k &&
        k.envVar === OPENROUTER_API_KEY.envVar
    );
    expect(apiKey).toBeDefined();
    expect(apiKey).toHaveProperty("mapToEnvVar", "OPENAI_API_KEY");
  });

  it("has environment function", () => {
    expect(QWEN_OPENROUTER_CODER_FREE_CONFIG.environment).toBeInstanceOf(
      Function
    );
  });

  it("has checkRequirements function", () => {
    expect(QWEN_OPENROUTER_CODER_FREE_CONFIG.checkRequirements).toBeInstanceOf(
      Function
    );
  });

  it("has completionDetector function", () => {
    expect(QWEN_OPENROUTER_CODER_FREE_CONFIG.completionDetector).toBeInstanceOf(
      Function
    );
  });
});

describe("QWEN_MODEL_STUDIO_CODER_PLUS_CONFIG", () => {
  it("has name qwen/qwen3-coder-plus", () => {
    expect(QWEN_MODEL_STUDIO_CODER_PLUS_CONFIG.name).toBe(
      "qwen/qwen3-coder-plus"
    );
  });

  it("uses qwen command", () => {
    expect(QWEN_MODEL_STUDIO_CODER_PLUS_CONFIG.command).toBe("qwen");
  });

  it("has --model and --yolo args", () => {
    expect(QWEN_MODEL_STUDIO_CODER_PLUS_CONFIG.args).toContain("--model");
    expect(QWEN_MODEL_STUDIO_CODER_PLUS_CONFIG.args).toContain("--yolo");
  });

  it("includes qwen3-coder-plus model in args", () => {
    expect(QWEN_MODEL_STUDIO_CODER_PLUS_CONFIG.args).toContain(
      "qwen3-coder-plus"
    );
  });

  it("has MODEL_STUDIO_API_KEY mapped to OPENAI_API_KEY", () => {
    const apiKey = QWEN_MODEL_STUDIO_CODER_PLUS_CONFIG.apiKeys?.find(
      (k) =>
        typeof k === "object" &&
        "envVar" in k &&
        k.envVar === MODEL_STUDIO_API_KEY.envVar
    );
    expect(apiKey).toBeDefined();
    expect(apiKey).toHaveProperty("mapToEnvVar", "OPENAI_API_KEY");
  });

  it("has environment function", () => {
    expect(QWEN_MODEL_STUDIO_CODER_PLUS_CONFIG.environment).toBeInstanceOf(
      Function
    );
  });

  it("has checkRequirements function", () => {
    expect(
      QWEN_MODEL_STUDIO_CODER_PLUS_CONFIG.checkRequirements
    ).toBeInstanceOf(Function);
  });

  it("has completionDetector function", () => {
    expect(
      QWEN_MODEL_STUDIO_CODER_PLUS_CONFIG.completionDetector
    ).toBeInstanceOf(Function);
  });
});
