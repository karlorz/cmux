import { v } from "convex/values";
import {
  CONFIG_PROVIDERS,
  DEVBOX_PROVIDERS,
  RUNTIME_PROVIDERS,
  SNAPSHOT_PROVIDERS,
} from "@cmux/shared/provider-types";

function literalsFromTuple<T extends readonly [string, string, ...string[]]>(
  values: T,
) {
  const [first, second, ...rest] = values;
  return v.union(
    v.literal(first),
    v.literal(second),
    ...rest.map((value) => v.literal(value)),
  );
}

export const runtimeProviderValidator = literalsFromTuple(RUNTIME_PROVIDERS);
export const snapshotProviderValidator = literalsFromTuple(SNAPSHOT_PROVIDERS);
export const devboxProviderValidator = literalsFromTuple(DEVBOX_PROVIDERS);
export const configProviderValidator = literalsFromTuple(CONFIG_PROVIDERS);
