import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cmux/convex/api";
import { useConvex } from "convex/react";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { FormDialog } from "@/components/ui/form-dialog";

// Behavior presets that combine recommended model + profile settings
const BEHAVIOR_PRESETS = [
  {
    id: "quick",
    name: "Quick Task",
    description: "Fast execution with minimal review",
    icon: "⚡",
    model: "", // auto-select (uses haiku)
    profile: "", // no profile
    priority: 5,
  },
  {
    id: "standard",
    name: "Standard",
    description: "Balanced speed and quality (recommended)",
    icon: "🎯",
    model: "", // auto-select
    profile: "", // no profile
    priority: 5,
  },
  {
    id: "thorough",
    name: "Thorough Review",
    description: "Extra validation and testing",
    icon: "🔍",
    model: "", // will prefer opus if available
    profile: "", // no profile, but priority lower
    priority: 3,
  },
] as const;

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
  const [selectedPreset, setSelectedPreset] = useState("standard");
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Advanced options (hidden by default)
  const [priority, setPriority] = useState(5);
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedProfile, setSelectedProfile] = useState("");

  // Apply preset settings when preset changes
  const handlePresetChange = (presetId: string) => {
    setSelectedPreset(presetId);
    const preset = BEHAVIOR_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setPriority(preset.priority);
      setSelectedModel(preset.model);
      setSelectedProfile(preset.profile);
    }
  };

  // Fetch available models
  const { data: models } = useQuery(
    convexQuery(api.models.listAvailable, { teamSlugOrId })
  );

  // Fetch supervisor profiles
  const { data: profiles } = useQuery(
    convexQuery(api.supervisorProfiles.list, { teamSlugOrId })
  );

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      const metadata: Record<string, string> = {};
      if (selectedModel) metadata.agentName = selectedModel;
      if (selectedProfile) metadata.supervisorProfileId = selectedProfile;
      const taskId = await convex.mutation(api.orchestrationQueries.createTask, {
        teamSlugOrId,
        prompt,
        priority,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      });
      return taskId;
    },
    onSuccess: () => {
      toast.success("Task created successfully");
      setPrompt("");
      setPriority(5);
      setSelectedModel("");
      setSelectedProfile("");
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
        <div className="grid grid-cols-3 gap-2">
          {BEHAVIOR_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handlePresetChange(preset.id)}
              className={`flex flex-col items-center rounded-lg border p-3 text-center transition-colors ${
                selectedPreset === preset.id
                  ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20"
                  : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600"
              }`}
            >
              <span className="text-lg mb-1">{preset.icon}</span>
              <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100">
                {preset.name}
              </span>
              <span className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                {preset.description}
              </span>
            </button>
          ))}
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
              onChange={(e) => setSelectedModel(e.target.value)}
              className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              <option value="">Auto-select</option>
              {models?.map((model) => (
                <option key={model._id} value={model._id}>
                  {model.displayName ?? model._id}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-neutral-500">
              Override automatic model selection
            </p>
          </div>

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
                    {profile.name} ({profile.reasoningLevel}/{profile.reviewPosture}/{profile.delegationStyle})
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
        </>
      )}
    </FormDialog>
  );
}
