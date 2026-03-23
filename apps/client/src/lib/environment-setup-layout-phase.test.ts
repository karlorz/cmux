import { describe, expect, it } from "vitest";

import { resolveEnvironmentSetupInitialLayoutPhase } from "./environment-setup-layout-phase";

describe("resolveEnvironmentSetupInitialLayoutPhase", () => {
  it("prefers the draft layout phase when present", () => {
    expect(
      resolveEnvironmentSetupInitialLayoutPhase({
        activeStep: "configure",
        activeInstanceId: "instance-123",
        draftLayoutPhase: "initial-setup",
      })
    ).toBe("initial-setup");
  });

  it("opens workspace config for configure routes with an instance id", () => {
    expect(
      resolveEnvironmentSetupInitialLayoutPhase({
        activeStep: "configure",
        activeInstanceId: "instance-123",
      })
    ).toBe("workspace-config");
  });

  it("leaves the phase unset when there is no instance yet", () => {
    expect(
      resolveEnvironmentSetupInitialLayoutPhase({
        activeStep: "configure",
      })
    ).toBeUndefined();
  });

  it("leaves the phase unset for selection routes", () => {
    expect(
      resolveEnvironmentSetupInitialLayoutPhase({
        activeStep: "select",
        activeInstanceId: "instance-123",
      })
    ).toBeUndefined();
  });
});
