/**
 * Shared scope/source badge and filter components for settings sections.
 * Used by PolicyRulesSection, PermissionRulesSection, McpServersSection, AgentConfigsSection.
 */
import {
  SCOPE_LABELS,
  SCOPE_BADGE_STYLES,
  CONTEXT_LABELS,
  SOURCE_LABELS,
  SOURCE_BADGE_STYLES,
  type ScopeValue,
  type SourceValue,
} from "./scope-constants";

export {
  SCOPE_LABELS,
  SCOPE_BADGE_STYLES,
  CONTEXT_LABELS,
  SOURCE_LABELS,
  SOURCE_BADGE_STYLES,
  type ScopeValue,
  type SourceValue,
};

export function ScopeBadge({ scope }: { scope: ScopeValue }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${SCOPE_BADGE_STYLES[scope]}`}
    >
      {SCOPE_LABELS[scope]}
    </span>
  );
}

export function SourceBadge({ source }: { source: SourceValue }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${SOURCE_BADGE_STYLES[source]}`}
    >
      {SOURCE_LABELS[source]}
    </span>
  );
}

export function ContextBadges({ contexts }: { contexts: string[] }) {
  if (!contexts || contexts.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {contexts.map((ctx) => (
        <span
          key={ctx}
          className="inline-flex items-center rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
        >
          {CONTEXT_LABELS[ctx] ?? ctx}
        </span>
      ))}
    </div>
  );
}

export function ScopeFilterTabs<T extends string>({
  scopes,
  activeScope,
  onScopeChange,
  scopeCounts,
}: {
  scopes: readonly T[];
  activeScope: T | "all";
  onScopeChange: (scope: T | "all") => void;
  scopeCounts: Record<T | "all", number>;
}) {
  return (
    <div className="border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
      <div className="flex gap-1">
        {(["all", ...scopes] as const).map((scope) => (
          <button
            key={scope}
            onClick={() => onScopeChange(scope as T | "all")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeScope === scope
                ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            }`}
          >
            {scope === "all"
              ? "All"
              : (SCOPE_LABELS as Record<string, string>)[scope] ?? scope}{" "}
            ({scopeCounts[scope as T | "all"] ?? 0})
          </button>
        ))}
      </div>
    </div>
  );
}
