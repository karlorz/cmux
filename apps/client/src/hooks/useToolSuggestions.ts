import { api } from "@cmux/convex/api";
import { useQuery } from "convex/react";
import { useMemo } from "react";
import { useDebouncedValue } from "./useDebouncedValue";

/**
 * Hook for suggesting MCP tools based on task prompt.
 *
 * Debounces the prompt and queries Convex for matching tools.
 */
export function useToolSuggestions(prompt: string, options?: { debounceMs?: number; limit?: number }) {
  const { debounceMs = 300, limit = 5 } = options ?? {};

  // Debounce prompt to avoid excessive queries
  const debouncedPrompt = useDebouncedValue(prompt, debounceMs);

  // Only query if prompt has enough content
  const shouldQuery = debouncedPrompt.length >= 10;

  const suggestions = useQuery(
    api.mcpTools.suggestForPrompt,
    shouldQuery ? { prompt: debouncedPrompt, limit } : "skip"
  );

  // Get default-enabled tools as fallback
  const defaultTools = useQuery(api.mcpTools.listDefaultEnabled);

  // Combine suggestions with defaults (suggestions first, then defaults not already suggested)
  const combinedTools = useMemo(() => {
    if (!shouldQuery) {
      return defaultTools ?? [];
    }

    const suggestionNames = new Set((suggestions ?? []).map((t) => t.name));
    const additionalDefaults = (defaultTools ?? []).filter((t) => !suggestionNames.has(t.name));

    return [...(suggestions ?? []), ...additionalDefaults].slice(0, limit);
  }, [suggestions, defaultTools, shouldQuery, limit]);

  return {
    suggestions: combinedTools,
    isLoading: shouldQuery ? suggestions === undefined : defaultTools === undefined,
    hasPromptSuggestions: shouldQuery && (suggestions?.length ?? 0) > 0,
  };
}

/**
 * Hook for getting all available MCP tools.
 */
export function useAllMcpTools() {
  const tools = useQuery(api.mcpTools.list);
  return {
    tools: tools ?? [],
    isLoading: tools === undefined,
  };
}

/**
 * Hook for team tool preferences.
 */
export function useTeamToolPreferences(teamId: string | undefined) {
  const preferences = useQuery(
    api.mcpTools.getTeamPreferences,
    teamId ? { teamId } : "skip"
  );

  return {
    preferences: preferences ?? [],
    isLoading: teamId ? preferences === undefined : false,
    isEnabled: (toolName: string) => {
      const pref = preferences?.find((p) => p.toolName === toolName);
      return pref?.enabled ?? true; // Default to enabled
    },
  };
}
