import { useToolSuggestions } from "@/hooks/useToolSuggestions";
import { Sparkles } from "lucide-react";
import { memo } from "react";

interface ToolSuggestionsProps {
  prompt: string;
  enabledTools: Set<string>;
  onToggleTool: (toolName: string) => void;
}

/**
 * Displays suggested MCP tools based on the task prompt.
 * Shows as a row of toggleable chips below the input.
 */
export const ToolSuggestions = memo(function ToolSuggestions({
  prompt,
  enabledTools,
  onToggleTool,
}: ToolSuggestionsProps) {
  const { suggestions, isLoading, hasPromptSuggestions } = useToolSuggestions(prompt, {
    debounceMs: 400,
    limit: 4,
  });

  // Don't render anything if no suggestions
  if (isLoading || suggestions.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-t border-neutral-200/50 dark:border-neutral-600/50">
      <span className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
        <Sparkles className="w-3 h-3" />
        {hasPromptSuggestions ? "Suggested tools:" : "Available tools:"}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((tool) => {
          const isEnabled = enabledTools.has(tool.name);
          return (
            <button
              key={tool.name}
              type="button"
              onClick={() => onToggleTool(tool.name)}
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium transition-colors cursor-pointer border ${
                isEnabled
                  ? "bg-emerald-500/90 hover:bg-emerald-600 text-white border-emerald-500"
                  : "bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 border-neutral-300 dark:border-neutral-600 hover:bg-neutral-200 dark:hover:bg-neutral-600"
              }`}
            >
              {tool.displayName}
            </button>
          );
        })}
      </div>
    </div>
  );
});
