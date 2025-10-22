import { v } from "convex/values";
import {
  CROWN_EVALUATION_STATUS_VALUES,
  isCrownEvaluationStatus,
  type CrownEvaluationStatus,
} from "@cmux/shared/crown/status";

export const LEGACY_CROWN_PENDING = "pending_evaluation" as const;
export const LEGACY_CROWN_IN_PROGRESS = "in_progress" as const;

export const CROWN_STATUS_VALUES = CROWN_EVALUATION_STATUS_VALUES;

export const crownStatusValidator = v.union(
  ...CROWN_EVALUATION_STATUS_VALUES.map((status) => v.literal(status)),
);

interface CrownStatusSource {
  crownEvaluationStatus?: CrownEvaluationStatus | null;
  crownEvaluationError?: string | null;
}

export const resolveCrownStatus = (
  task: CrownStatusSource,
): CrownEvaluationStatus => {
  const { crownEvaluationStatus, crownEvaluationError } = task;
  if (isCrownEvaluationStatus(crownEvaluationStatus)) {
    return crownEvaluationStatus;
  }

  if (crownEvaluationError === LEGACY_CROWN_PENDING) {
    return "pending";
  }

  if (crownEvaluationError === LEGACY_CROWN_IN_PROGRESS) {
    return "in_progress";
  }

  if (crownEvaluationError && crownEvaluationError.length > 0) {
    return "error";
  }

  return "idle";
};

export type { CrownEvaluationStatus } from "@cmux/shared/crown/status";
