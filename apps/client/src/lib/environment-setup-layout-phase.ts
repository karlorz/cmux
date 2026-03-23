import type { LayoutPhase } from "@cmux/shared/components/environment";

type ResolveEnvironmentSetupInitialLayoutPhaseArgs = {
  activeStep: "select" | "configure";
  activeInstanceId?: string;
  draftLayoutPhase?: LayoutPhase;
};

export function resolveEnvironmentSetupInitialLayoutPhase({
  activeStep,
  activeInstanceId,
  draftLayoutPhase,
}: ResolveEnvironmentSetupInitialLayoutPhaseArgs): LayoutPhase | undefined {
  if (draftLayoutPhase) {
    return draftLayoutPhase;
  }

  if (activeStep === "configure" && activeInstanceId) {
    return "workspace-config";
  }

  return undefined;
}
