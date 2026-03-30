import { describe, expect, it } from "vitest";

import { resolveActiveSettingsSection } from "./settings-section";

describe("resolveActiveSettingsSection", () => {
  it("preserves permission rules", () => {
    expect(resolveActiveSettingsSection("permission-rules")).toBe(
      "permission-rules"
    );
  });

  it("preserves orchestration rules", () => {
    expect(resolveActiveSettingsSection("orchestration-rules")).toBe(
      "orchestration-rules"
    );
  });

  it("preserves orchestration settings", () => {
    expect(resolveActiveSettingsSection("orchestration-settings")).toBe(
      "orchestration-settings"
    );
  });

  it("falls back to general for invalid values", () => {
    expect(resolveActiveSettingsSection("not-a-section")).toBe("general");
    expect(resolveActiveSettingsSection(undefined)).toBe("general");
  });
});
