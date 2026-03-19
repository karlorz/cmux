import { describe, expect, it } from "vitest";
import { AMP_CONFIG, AMP_GPT_5_CONFIG, AMP_AGENT_CONFIGS } from "./configs";
import { AMP_API_KEY } from "../../apiKeys";

describe("AMP_AGENT_CONFIGS", () => {
  it("contains AMP_CONFIG and AMP_GPT_5_CONFIG", () => {
    expect(AMP_AGENT_CONFIGS).toContain(AMP_CONFIG);
    expect(AMP_AGENT_CONFIGS).toContain(AMP_GPT_5_CONFIG);
    expect(AMP_AGENT_CONFIGS).toHaveLength(2);
  });
});

describe("AMP_CONFIG", () => {
  it("has name amp", () => {
    expect(AMP_CONFIG.name).toBe("amp");
  });

  it("uses prompt-wrapper command", () => {
    expect(AMP_CONFIG.command).toBe("prompt-wrapper");
  });

  it("has --prompt-env CMUX_PROMPT in args", () => {
    expect(AMP_CONFIG.args).toContain("--prompt-env");
    expect(AMP_CONFIG.args).toContain("CMUX_PROMPT");
  });

  it("has amp command after -- separator", () => {
    const sepIndex = AMP_CONFIG.args.indexOf("--");
    expect(sepIndex).toBeGreaterThan(-1);
    expect(AMP_CONFIG.args[sepIndex + 1]).toBe("amp");
  });

  it("has --dangerously-allow-all flag", () => {
    expect(AMP_CONFIG.args).toContain("--dangerously-allow-all");
  });

  it("has AMP_API_KEY in apiKeys", () => {
    expect(AMP_CONFIG.apiKeys).toContain(AMP_API_KEY);
  });

  it("has environment function", () => {
    expect(AMP_CONFIG.environment).toBeInstanceOf(Function);
  });

  it("has checkRequirements function", () => {
    expect(AMP_CONFIG.checkRequirements).toBeInstanceOf(Function);
  });
});

describe("AMP_GPT_5_CONFIG", () => {
  it("has name amp/gpt-5", () => {
    expect(AMP_GPT_5_CONFIG.name).toBe("amp/gpt-5");
  });

  it("uses prompt-wrapper command", () => {
    expect(AMP_GPT_5_CONFIG.command).toBe("prompt-wrapper");
  });

  it("has --try-gpt5 flag", () => {
    expect(AMP_GPT_5_CONFIG.args).toContain("--try-gpt5");
  });

  it("has --dangerously-allow-all flag", () => {
    expect(AMP_GPT_5_CONFIG.args).toContain("--dangerously-allow-all");
  });

  it("has AMP_API_KEY in apiKeys", () => {
    expect(AMP_GPT_5_CONFIG.apiKeys).toContain(AMP_API_KEY);
  });

  it("has environment function", () => {
    expect(AMP_GPT_5_CONFIG.environment).toBeInstanceOf(Function);
  });

  it("has checkRequirements function", () => {
    expect(AMP_GPT_5_CONFIG.checkRequirements).toBeInstanceOf(Function);
  });
});
