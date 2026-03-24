import { SettingSection } from "../SettingSection";
import { SettingSwitch } from "../SettingSwitch";
import { SettingSelect } from "../SettingSelect";
import { SettingRow } from "../SettingRow";
import { api } from "@cmux/convex/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useConvex } from "convex/react";
import { useState, useEffect, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface OrchestrationSettingsSectionProps {
  teamSlugOrId: string;
}

const CODING_AGENT_OPTIONS = [
  { value: "codex/gpt-5.4-mini", label: "Codex 5.4 Mini (Fast & Low-Cost)" },
  { value: "codex/gpt-5.1-codex-mini", label: "Codex 5.1 Mini (Fast)" },
  { value: "codex/gpt-5.4-xhigh", label: "Codex 5.4 XHigh (Powerful)" },
  { value: "claude/haiku-4.5", label: "Claude Haiku (Fast)" },
  { value: "claude/sonnet-4", label: "Claude Sonnet (Balanced)" },
  { value: "claude/opus-4.5", label: "Claude Opus (Powerful)" },
];

const MAX_CONCURRENT_OPTIONS = [
  { value: "1", label: "1 agent" },
  { value: "2", label: "2 agents" },
  { value: "3", label: "3 agents" },
  { value: "5", label: "5 agents" },
  { value: "10", label: "10 agents" },
];

export function OrchestrationSettingsSection({ teamSlugOrId }: OrchestrationSettingsSectionProps) {
  const convex = useConvex();
  const { data: settings, isLoading, refetch } = useQuery({
    ...convexQuery(api.orchestrationSettings.get, { teamSlugOrId }),
    staleTime: 5000,
  });

  const [localMaxConcurrent, setLocalMaxConcurrent] = useState<string>("3");
  const [localMaxDuration, setLocalMaxDuration] = useState<string>("60");

  useEffect(() => {
    if (settings) {
      setLocalMaxConcurrent(String(settings.maxConcurrentSubAgents ?? 3));
      setLocalMaxDuration(String(settings.maxTaskDurationMinutes ?? 60));
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async (updates: {
      teamSlugOrId: string;
      autoHeadAgent?: boolean;
      autoSpawnEnabled?: boolean;
      defaultCodingAgent?: string;
      maxConcurrentSubAgents?: number;
      maxTaskDurationMinutes?: number;
    }) => {
      return convex.mutation(api.orchestrationSettings.update, updates);
    },
    onSuccess: () => {
      refetch();
      toast.success("Settings updated");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  const handleToggle = (field: "autoHeadAgent" | "autoSpawnEnabled", value: boolean) => {
    updateMutation.mutate({
      teamSlugOrId,
      [field]: value,
    });
  };

  const handleSelectChange = (field: string, value: string) => {
    if (field === "maxConcurrentSubAgents") {
      setLocalMaxConcurrent(value);
      updateMutation.mutate({
        teamSlugOrId,
        maxConcurrentSubAgents: parseInt(value, 10),
      });
    } else if (field === "defaultCodingAgent") {
      updateMutation.mutate({
        teamSlugOrId,
        defaultCodingAgent: value,
      });
    }
  };

  const handleDurationBlur = () => {
    const duration = parseInt(localMaxDuration, 10);
    if (!isNaN(duration) && duration > 0 && duration !== settings?.maxTaskDurationMinutes) {
      updateMutation.mutate({
        teamSlugOrId,
        maxTaskDurationMinutes: duration,
      });
    }
  };

  if (isLoading) {
    return (
      <SettingSection title="Orchestration" description="Configure auto head-agent and sub-agent spawning">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </SettingSection>
    );
  }

  return (
    <SettingSection
      title="Orchestration"
      description="Configure auto head-agent mode and sub-agent spawning behavior"
    >
      <SettingSwitch
        label="Auto Head-Agent Mode"
        description="Cloud workspaces automatically act as head agents that can coordinate sub-agents"
        isSelected={settings?.autoHeadAgent ?? false}
        onValueChange={(v) => handleToggle("autoHeadAgent", v)}
        ariaLabel="Toggle auto head-agent mode"
        isDisabled={updateMutation.isPending}
      />

      <SettingSwitch
        label="Auto-Spawn Sub-Agents"
        description="Allow head agents to automatically spawn coding sub-agents for delegated tasks"
        isSelected={settings?.autoSpawnEnabled ?? false}
        onValueChange={(v) => handleToggle("autoSpawnEnabled", v)}
        ariaLabel="Toggle auto-spawn sub-agents"
        isDisabled={updateMutation.isPending}
      />

      <SettingSelect
        id="default-coding-agent"
        label="Default Coding Agent"
        description="Preferred agent for sub-agent spawning when not specified"
        value={settings?.defaultCodingAgent ?? "codex/gpt-5.1-codex-mini"}
        options={CODING_AGENT_OPTIONS}
        onValueChange={(v) => handleSelectChange("defaultCodingAgent", v)}
      />

      <SettingSelect
        id="max-concurrent-subagents"
        label="Max Concurrent Sub-Agents"
        description="Maximum number of sub-agents that can run in parallel"
        value={localMaxConcurrent}
        options={MAX_CONCURRENT_OPTIONS}
        onValueChange={(v) => handleSelectChange("maxConcurrentSubAgents", v)}
      />

      <SettingRow
        label="Max Task Duration (minutes)"
        description="Maximum time a sub-agent task can run before timeout"
      >
        <input
          type="number"
          min={1}
          max={480}
          value={localMaxDuration}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setLocalMaxDuration(e.target.value)}
          onBlur={handleDurationBlur}
          className="w-24 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          disabled={updateMutation.isPending}
        />
      </SettingRow>
    </SettingSection>
  );
}
