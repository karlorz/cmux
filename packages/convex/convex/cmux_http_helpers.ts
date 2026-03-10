/**
 * Helper functions for cmux_http.ts
 * Separated to avoid env dependency issues in tests.
 */

const CONVEX_ID_REGEX = /^[a-z][a-z0-9]*$/i;

export function isValidConvexId(id: string): boolean {
  return CONVEX_ID_REGEX.test(id);
}

export function isConvexIdValidationError(error: unknown): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return errorMessage.includes("Invalid ID") || errorMessage.includes("not a valid ID");
}
