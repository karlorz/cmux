import type { Id } from "@cmux/convex/dataModel";

/**
 * Environment data structure from the environments query.
 */
export interface EnvironmentData {
  _id: Id<"environments">;
  name: string;
  selectedRepos?: string[];
}

/**
 * Result of resolving the selected environment from the dashboard state.
 */
export interface ResolvedEnvironment {
  /** The resolved environment name, or null if not found */
  name: string | null;
  /** The selected repos from the environment, or empty array if not found */
  repos: string[];
  /** The environment ID extracted from the selection */
  environmentId: Id<"environments"> | null;
}

/**
 * Resolves the selected environment name and repos from the selectedProject
 * string and the list of environments.
 *
 * @param selectedProject - The selected project value (e.g., "env:abc123" or "owner/repo")
 * @param environments - The list of environments from the query
 * @returns The resolved environment data
 *
 * @example
 * ```ts
 * // Environment selected
 * resolveSelectedEnvironment("env:abc123", environments)
 * // { name: "my-env", repos: ["owner/repo1"], environmentId: "abc123" }
 *
 * // Repo selected (not an environment)
 * resolveSelectedEnvironment("owner/repo", environments)
 * // { name: null, repos: [], environmentId: null }
 *
 * // Environment not found in list
 * resolveSelectedEnvironment("env:unknown", environments)
 * // { name: null, repos: [], environmentId: "unknown" }
 * ```
 */
export function resolveSelectedEnvironment(
  selectedProject: string | undefined,
  environments: EnvironmentData[] | undefined
): ResolvedEnvironment {
  // No selection or not an environment selection
  if (!selectedProject || !selectedProject.startsWith("env:")) {
    return { name: null, repos: [], environmentId: null };
  }

  const environmentId = selectedProject.replace(
    /^env:/,
    ""
  ) as Id<"environments">;

  // No environments data available
  if (!environments) {
    return { name: null, repos: [], environmentId };
  }

  const environment = environments.find((env) => env._id === environmentId);

  if (!environment) {
    return { name: null, repos: [], environmentId };
  }

  return {
    name: environment.name,
    repos: Array.from(new Set(environment.selectedRepos ?? [])),
    environmentId,
  };
}

/**
 * Checks if the selected project is an environment selection.
 */
export function isEnvironmentSelection(selectedProject: string | undefined): boolean {
  return !!selectedProject && selectedProject.startsWith("env:");
}
