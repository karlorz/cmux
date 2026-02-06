import { describe, expect, it } from "vitest";
import { API_KEY_MODELS_BY_ENV } from "./model-usage";

describe("API_KEY_MODELS_BY_ENV", () => {
  it("includes gpt-5.2-codex and gpt-5.3-codex for OPENAI_API_KEY", () => {
    const models = API_KEY_MODELS_BY_ENV.OPENAI_API_KEY ?? [];
    expect(models).toContain("codex/gpt-5.2-codex");
    expect(models).toContain("codex/gpt-5.3-codex");
  });
});
