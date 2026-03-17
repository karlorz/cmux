import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cmux/convex/api";
import { useConvex } from "convex/react";
import { toast } from "sonner";
import { FormDialog } from "@/components/ui/form-dialog";

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
  const [priority, setPriority] = useState(5);
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedProfile, setSelectedProfile] = useState("");

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

      {/* Model selector */}
      <div>
        <label
          htmlFor="model"
          className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
        >
          Agent Model (Optional)
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
          Leave empty to let the worker select the best available agent
        </p>
      </div>

      {/* Supervisor Profile */}
      {profiles && profiles.length > 0 && (
        <div>
          <label
            htmlFor="profile"
            className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
          >
            Supervisor Profile (Optional)
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
    </FormDialog>
  );
}
