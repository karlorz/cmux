import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cmux/convex/api";
import { useConvex } from "convex/react";
import { toast } from "sonner";
import {
  ChevronDown,
  Zap,
  Target,
  Search,
  Building2,
  Box,
  Monitor,
  Cloud,
  type LucideIcon,
} from "lucide-react";
import { FormDialog } from "@/components/ui/form-dialog";
import { applyPresetToSpawnOptions, type OperatorPreset } from "@cmux/shared";
import { WWW_ORIGIN } from "@/lib/wwwOrigin";

/**
 * Map icon name to Lucide component.
 */
const ICON_MAP: Record<string, LucideIcon> = {
  zap: Zap,
  target: Target,
  search: Search,
  building: Building2,
  box: Box,
};

function getPresetIcon(iconName: string): LucideIcon {
  return ICON_MAP[iconName] ?? Box;
}

interface OrchestrationSpawnDialogProps {
  teamSlugOrId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrchestrationSpawnDialog({
  teamSlugOrId,
  open,
  onOpenChange,
}: OrchestrationSpawnDialogProps) {
  const convex = useConvex();
  const queryClient = useQueryClient();

  const [prompt, setPrompt] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("standard");
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Advanced options (hidden by default)
  const [priority, setPriority] = useState(5);
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedVariant, setSelectedVariant] = useState("");
  const [selectedProfile, setSelectedProfile] = useState("");
  const [selectedTaskClass, setSelectedTaskClass] = useState<
    string | undefined
  >(undefined);
  const [selectedVenue, setSelectedVenue] = useState<"auto" | "local" | "remote">("auto");

  // Fetch operator presets (built-in + custom)
  const { data: presets } = useQuery(
    convexQuery(api.operatorPresets.list, { teamSlugOrId }),
  );

  // Apply preset settings when preset changes
  const handlePresetChange = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = presets?.find((p: OperatorPreset) => p.id === presetId);
    if (preset) {
      const options = applyPresetToSpawnOptions(preset);
      setPriority(options.priority);
      setSelectedModel(options.agentName ?? "");
      setSelectedVariant(options.selectedVariant ?? "");
      setSelectedProfile(options.supervisorProfileId ?? "");
      setSelectedTaskClass(options.taskClass);
    }
  };

  // Fetch available models
  const { data: models } = useQuery(
    convexQuery(api.models.listAvailable, { teamSlugOrId }),
  );

  // Fetch supervisor profiles
  const { data: profiles } = useQuery(
    convexQuery(api.supervisorProfiles.list, { teamSlugOrId }),
  );

  const selectedModelEntry = models?.find(
    (model) => model.name === selectedModel,
  );
  const selectedModelVariants = selectedModelEntry?.variants ?? [];
  const selectedModelDefaultVariant = selectedModelEntry?.defaultVariant ?? "";
  const showEffortSelector = selectedModelVariants.length > 1;

  const handleModelChange = (modelName: string) => {
    setSelectedModel(modelName);
    if (!modelName) {
      setSelectedVariant("");
      return;
    }

    const nextModel = models?.find((model) => model.name === modelName);
    const nextVariants = nextModel?.variants ?? [];
    const nextDefaultVariant = nextModel?.defaultVariant ?? "";
    setSelectedVariant(nextVariants.length > 1 ? nextDefaultVariant : "");
  };

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      // Handle local spawn via HTTP endpoint
      if (selectedVenue === "local") {
        const response = await fetch(`${WWW_ORIGIN}/api/orchestrate/spawn-local`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamSlugOrId,
            agent: selectedModel || "claude/haiku-4.5",
            prompt,
          }),
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.details || error.error || "Failed to spawn local run");
        }
        return response.json();
      }

      // Remote spawn via Convex mutation (existing behavior)
      const metadata: Record<string, string> = {};
      if (selectedModel && selectedVariant)
        metadata.selectedVariant = selectedVariant;
      if (selectedProfile) metadata.supervisorProfileId = selectedProfile;
      if (selectedTaskClass) metadata.taskClass = selectedTaskClass;
      const taskId = await convex.mutation(
        api.orchestrationQueries.createTask,
        {
          teamSlugOrId,
          prompt,
          agentName: selectedModel || undefined,
          priority,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        },
      );
      return { taskId, venue: "remote" };
    },
    onSuccess: (result) => {
      const venue = "venue" in result ? result.venue : "remote";
      toast.success(venue === "local"
        ? `Local run started: ${result.runId}`
        : "Task created successfully"
      );
      setPrompt("");
      setPriority(5);
      setSelectedModel("");
      setSelectedVariant("");
      setSelectedProfile("");
      setSelectedTaskClass(undefined);
      setSelectedVenue("auto");
      onOpenChange(false);
      void queryClient.invalidateQueries();
    },
    onError: (error) => {
      toast.error(`Failed to create task: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }
    createTaskMutation.mutate();
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Spawn Agent Task"
      description="Create a new orchestration task. The background worker will assign it to an available agent."
      submitLabel="Create Task"
      onSubmit={handleSubmit}
      isLoading={createTaskMutation.isPending}
      loadingLabel="Creating..."
      isSubmitDisabled={!prompt.trim()}
    >
      {/* Prompt */}
      <div>
        <label
          htmlFor="prompt"
          className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
        >
          Task Prompt
        </label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          placeholder="Describe what the agent should do..."
        />
      </div>

      {/* Behavior Preset */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          Behavior
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {!presets && (
            <div className="col-span-full text-center text-sm text-neutral-500 py-4">
              Loading presets...
            </div>
          )}
          {presets?.map((preset: OperatorPreset) => {
            const IconComponent = getPresetIcon(preset.icon);
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePresetChange(preset.id)}
                className={`flex flex-col items-center rounded-lg border p-3 text-center transition-colors ${
                  selectedPresetId === preset.id
                    ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20"
                    : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600"
                }`}
              >
                <IconComponent className="h-5 w-5 mb-1 text-neutral-600 dark:text-neutral-400" />
                <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100">
                  {preset.name}
                </span>
                <span className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-2">
                  {preset.description}
                </span>
                {!preset.isBuiltin && (
                  <span className="text-[9px] text-blue-500 dark:text-blue-400 mt-1">
                    Custom
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Advanced toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
        />
        Advanced options
      </button>

      {/* Advanced options (hidden by default) */}
      {showAdvanced && (
        <>
          {/* Model selector */}
          <div>
            <label
              htmlFor="model"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Agent Model
            </label>
            <select
              id="model"
              value={selectedModel}
              onChange={(e) => handleModelChange(e.target.value)}
              className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              <option value="">Auto-select</option>
              {models?.map((model) => (
                <option key={model._id} value={model.name}>
                  {model.displayName ?? model.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-neutral-500">
              Override automatic model selection
            </p>
          </div>

          {showEffortSelector && (
            <div>
              <label
                htmlFor="effort"
                className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
              >
                Effort
              </label>
              <select
                id="effort"
                value={selectedVariant}
                onChange={(e) => setSelectedVariant(e.target.value)}
                className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              >
                {selectedModelVariants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.displayName}
                    {variant.id === selectedModelDefaultVariant
                      ? " (Default)"
                      : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-neutral-500">
                Provider-aware reasoning effort for the selected model
              </p>
            </div>
          )}

          {/* Supervisor Profile */}
          {profiles && profiles.length > 0 && (
            <div>
              <label
                htmlFor="profile"
                className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
              >
                Supervisor Profile
              </label>
              <select
                id="profile"
                value={selectedProfile}
                onChange={(e) => setSelectedProfile(e.target.value)}
                className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              >
                <option value="">None (default behavior)</option>
                {profiles.map((profile) => (
                  <option key={profile._id} value={profile._id}>
                    {profile.name} ({profile.reasoningLevel}/
                    {profile.reviewPosture}/{profile.delegationStyle})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-neutral-500">
                Controls head agent reasoning, review, and delegation style
              </p>
            </div>
          )}

          {/* Priority */}
          <div>
            <label
              htmlFor="priority"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Priority (1 = highest, 10 = lowest)
            </label>
            <input
              type="number"
              id="priority"
              min={1}
              max={10}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="mt-1 block w-24 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>

          {/* Execution Venue */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Execution Venue
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedVenue("auto")}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                  selectedVenue === "auto"
                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/20 dark:text-blue-300"
                    : "border-neutral-300 text-neutral-700 hover:border-neutral-400 dark:border-neutral-600 dark:text-neutral-300"
                }`}
              >
                <Zap className="h-4 w-4" />
                Auto
              </button>
              <button
                type="button"
                onClick={() => setSelectedVenue("local")}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                  selectedVenue === "local"
                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/20 dark:text-blue-300"
                    : "border-neutral-300 text-neutral-700 hover:border-neutral-400 dark:border-neutral-600 dark:text-neutral-300"
                }`}
              >
                <Monitor className="h-4 w-4" />
                Local
              </button>
              <button
                type="button"
                onClick={() => setSelectedVenue("remote")}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                  selectedVenue === "remote"
                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/20 dark:text-blue-300"
                    : "border-neutral-300 text-neutral-700 hover:border-neutral-400 dark:border-neutral-600 dark:text-neutral-300"
                }`}
              >
                <Cloud className="h-4 w-4" />
                Remote
              </button>
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              {selectedVenue === "auto" && "Let cmux choose based on task complexity"}
              {selectedVenue === "local" && "Run in local workspace via devsh run-local"}
              {selectedVenue === "remote" && "Run in remote sandbox (default)"}
            </p>
          </div>
        </>
      )}
    </FormDialog>
  );
}
