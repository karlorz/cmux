import { describe, expect, it } from "vitest";
import { API_KEY_MODELS_BY_ENV } from "./model-usage";
import { AGENT_CONFIGS } from "./agentConfig";

describe("API_KEY_MODELS_BY_ENV", () => {
  it("includes Codex gpt-5.2-codex* and gpt-5.3-codex* under OPENAI_API_KEY", () => {
    const openaiModels = API_KEY_MODELS_BY_ENV.OPENAI_API_KEY ?? [];

    expect(openaiModels).toContain("codex/gpt-5.2-codex");
    expect(openaiModels).toContain("codex/gpt-5.2-codex-high");

    expect(openaiModels).toContain("codex/gpt-5.3-codex");
    expect(openaiModels).toContain("codex/gpt-5.3-codex-high");
  });

  it("includes Codex gpt-5.3-codex* under CODEX_AUTH_JSON", () => {
    const codexAuthModels = API_KEY_MODELS_BY_ENV.CODEX_AUTH_JSON ?? [];
    expect(codexAuthModels).toContain("codex/gpt-5.3-codex");
    expect(codexAuthModels).toContain("codex/gpt-5.3-codex-medium");
  });
});

describe("Codex 5.2/5.3 key requirement parity", () => {
  const codex52Variants = AGENT_CONFIGS.filter((c) =>
    c.name.startsWith("codex/gpt-5.2-codex")
  );
  const codex53Variants = AGENT_CONFIGS.filter((c) =>
    c.name.startsWith("codex/gpt-5.3-codex")
  );

  it("has matching 5.2-codex and 5.3-codex variant suffixes", () => {
    const get52Suffixes = codex52Variants.map((c) =>
      c.name.replace("codex/gpt-5.2-codex", "")
    );
    const get53Suffixes = codex53Variants.map((c) =>
      c.name.replace("codex/gpt-5.3-codex", "")
    );

    expect(get52Suffixes.sort()).toEqual(get53Suffixes.sort());
  });

  it("all codex/gpt-5.2-codex* variants require OPENAI_API_KEY", () => {
    const openaiModels = API_KEY_MODELS_BY_ENV.OPENAI_API_KEY ?? [];
    for (const config of codex52Variants) {
      expect(openaiModels).toContain(config.name);
    }
  });

  it("all codex/gpt-5.3-codex* variants require OPENAI_API_KEY", () => {
    const openaiModels = API_KEY_MODELS_BY_ENV.OPENAI_API_KEY ?? [];
    for (const config of codex53Variants) {
      expect(openaiModels).toContain(config.name);
    }
  });

  it("all codex/gpt-5.2-codex* variants require CODEX_AUTH_JSON", () => {
    const codexAuthModels = API_KEY_MODELS_BY_ENV.CODEX_AUTH_JSON ?? [];
    for (const config of codex52Variants) {
      expect(codexAuthModels).toContain(config.name);
    }
  });

  it("all codex/gpt-5.3-codex* variants require CODEX_AUTH_JSON", () => {
    const codexAuthModels = API_KEY_MODELS_BY_ENV.CODEX_AUTH_JSON ?? [];
    for (const config of codex53Variants) {
      expect(codexAuthModels).toContain(config.name);
    }
  });

  it("5.2-codex and 5.3-codex configs use identical apiKeys array structure", () => {
    for (const config52 of codex52Variants) {
      const suffix = config52.name.replace("codex/gpt-5.2-codex", "");
      const config53 = codex53Variants.find(
        (c) => c.name === `codex/gpt-5.3-codex${suffix}`
      );
      expect(config53).toBeDefined();

      const keys52 = (config52.apiKeys ?? []).map((k) => k.envVar).sort();
      const keys53 = (config53!.apiKeys ?? []).map((k) => k.envVar).sort();
      expect(keys52).toEqual(keys53);
    }
  });
});

