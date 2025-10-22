import type { CrownEvaluationStatus } from "../../shared/src/crown/types";

export type { CrownEvaluationStatus } from "../../shared/src/crown/types";

export const LEGACY_PENDING_EVALUATION = "pending_evaluation" as const;
export const LEGACY_IN_PROGRESS_EVALUATION = "in_progress" as const;

export type TaskCrownStatusSource = {
  crownEvaluationStatus?: CrownEvaluationStatus | null;
  crownEvaluationError?: string | null;
};

export function deriveCrownStatus(
  task?: TaskCrownStatusSource | null,
): CrownEvaluationStatus | null {
  if (!task) {
    return null;
  }

  switch (task.crownEvaluationStatus) {
    case "pending":
    case "in_progress":
    case "succeeded":
    case "failed":
      return task.crownEvaluationStatus;
    default:
      break;
  }

  if (task.crownEvaluationError === LEGACY_PENDING_EVALUATION) {
    return "pending";
  }

  if (task.crownEvaluationError === LEGACY_IN_PROGRESS_EVALUATION) {
    return "in_progress";
  }

  return null;
}
