export const CROWN_EVALUATION_STATUS_VALUES = [
  "idle",
  "pending",
  "in_progress",
  "completed",
  "error",
] as const;

export type CrownEvaluationStatus =
  (typeof CROWN_EVALUATION_STATUS_VALUES)[number];

export const isCrownEvaluationStatus = (
  value: unknown,
): value is CrownEvaluationStatus =>
  typeof value === "string" &&
  (CROWN_EVALUATION_STATUS_VALUES as readonly string[]).includes(value);
