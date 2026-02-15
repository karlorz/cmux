/**
 * Convex Validators for Provider Types
 *
 * This module derives Convex validators from the shared provider type tuples.
 * Use these validators in schema definitions and function arguments to ensure
 * type consistency across the codebase.
 */

import { v } from "convex/values";
import {
  RUNTIME_PROVIDERS,
  SNAPSHOT_PROVIDERS,
  DEVBOX_PROVIDERS,
  CONFIG_PROVIDERS,
} from "@cmux/shared/provider-types";

/**
 * Creates a Convex validator from a readonly tuple of string literals.
 * v.union requires at least 2 members, which all our provider tuples satisfy.
 */
function literalsFromTuple<T extends readonly [string, string, ...string[]]>(
  values: T
) {
  const [first, second, ...rest] = values;
  const literals = [v.literal(first), v.literal(second), ...rest.map((val) => v.literal(val))];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return v.union(...literals as any);
}

/**
 * Validator for runtime providers.
 * Use in schemas for VSCode provider, socket events, sandbox activity.
 */
export const runtimeProviderValidator = literalsFromTuple(RUNTIME_PROVIDERS);

/**
 * Validator for snapshot providers.
 * Use in schemas for environment snapshots, sandboxInstanceActivity.
 */
export const snapshotProviderValidator = literalsFromTuple(SNAPSHOT_PROVIDERS);

/**
 * Validator for devbox providers.
 * Use in schemas for devboxInfo and devboxInstances.
 */
export const devboxProviderValidator = literalsFromTuple(DEVBOX_PROVIDERS);

/**
 * Validator for config providers.
 * Use in schemas for sandbox config API responses.
 */
export const configProviderValidator = literalsFromTuple(CONFIG_PROVIDERS);
