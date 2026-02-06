import { describe, expect, it } from "vitest";
import { API_KEY_MODELS_BY_ENV } from "./model-usage";

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

