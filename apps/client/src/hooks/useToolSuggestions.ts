import { api } from "@cmux/convex/api";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useMemo } from "react";
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
 * Hook for suggesting MCP tools with team-based learning.
 *
 * Uses team usage patterns to boost frequently-selected tools.
 */
export function useToolSuggestionsWithLearning(
  prompt: string,
  teamId: string | undefined,
  options?: { debounceMs?: number; limit?: number }
) {
  const { debounceMs = 300, limit = 5 } = options ?? {};

  const debouncedPrompt = useDebouncedValue(prompt, debounceMs);
  const shouldQuery = debouncedPrompt.length >= 10;

  // Use enhanced query with learning
  const suggestions = useQuery(
    api.mcpTools.suggestForPromptWithLearning,
    shouldQuery ? { prompt: debouncedPrompt, teamId, limit } : "skip"
  );

  const defaultTools = useQuery(api.mcpTools.listDefaultEnabled);

  const combinedTools = useMemo(() => {
    if (!shouldQuery) {
      return (defaultTools ?? []).map((t) => ({ ...t, usageCount: 0 }));
    }

    const suggestionNames = new Set((suggestions ?? []).map((t) => t.name));
    const additionalDefaults = (defaultTools ?? [])
      .filter((t) => !suggestionNames.has(t.name))
      .map((t) => ({ ...t, usageCount: 0 }));

    return [...(suggestions ?? []), ...additionalDefaults].slice(0, limit);
  }, [suggestions, defaultTools, shouldQuery, limit]);

  return {
    suggestions: combinedTools,
    isLoading: shouldQuery ? suggestions === undefined : defaultTools === undefined,
    hasPromptSuggestions: shouldQuery && (suggestions?.length ?? 0) > 0,
  };
}

/**
 * Hook for tracking tool selection to enable learning.
 */
export function useToolSelectionTracker(teamId: string | undefined) {
  const trackSelection = useMutation(api.mcpTools.trackToolSelection);

  const track = useCallback(
    async (toolName: string, prompt?: string) => {
      if (!teamId) return;

      // Extract keywords from prompt for learning
      const promptKeywords = prompt
        ? prompt
            .toLowerCase()
            .split(/\W+/)
            .filter((w) => w.length > 3)
            .slice(0, 10)
        : undefined;

      await trackSelection({ teamId, toolName, promptKeywords });
    },
    [teamId, trackSelection]
  );

  return { trackSelection: track };
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
