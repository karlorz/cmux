import { useState, useMemo, useEffect, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cmux/convex/api";
import { useConvex } from "convex/react";
import { toast } from "sonner";
import { Loader2, X, Check, Settings } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { Id } from "@cmux/convex/dataModel";
import { STATUS_CONFIG, type TaskStatus } from "./status-config";

/** Statuses that represent incomplete tasks that can be dependencies */
const DEPENDENCY_ELIGIBLE_STATUSES: ReadonlySet<TaskStatus> = new Set(["pending", "assigned", "running"]);
/** Maximum characters to show for task prompts in the dependency selector */
const PROMPT_PREVIEW_MAX_LENGTH = 60;

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
  const [selectedDependencies, setSelectedDependencies] = useState<Set<Id<"orchestrationTasks">>>(new Set());

  // Reset form state when dialog closes
  useEffect(() => {
    if (!open) {
      setPrompt("");
      setPriority(5);
      setSelectedModel("");
      setSelectedDependencies(new Set());
    }
  }, [open]);

  // Fetch available models
  const { data: models } = useQuery(
    convexQuery(api.models.listAvailable, { teamSlugOrId })
  );

  // Fetch existing tasks for dependency selection (pending/assigned/running only)
  const { data: existingTasks } = useQuery(
    convexQuery(api.orchestrationQueries.listTasksByTeam, {
      teamSlugOrId,
      limit: 50,
    })
  );

  // Filter to tasks that can be dependencies (pending/assigned/running)
  const dependencyOptions = useMemo(() => {
    if (!existingTasks) return [];
    return existingTasks.filter((t) =>
      DEPENDENCY_ELIGIBLE_STATUSES.has(t.status as TaskStatus)
    );
  }, [existingTasks]);

  // Group models by vendor for optgroup display
  type ModelItem = NonNullable<typeof models>[number];
  const modelsByVendor = useMemo(() => {
    if (!models) return [];
    const grouped = new Map<string, ModelItem[]>();
    for (const model of models) {
      const vendor = model.vendor || "other";
      const existing = grouped.get(vendor) || [];
      existing.push(model);
      grouped.set(vendor, existing);
    }
    // Sort vendors: anthropic first, then openai, then alphabetically
    const sortedVendors = Array.from(grouped.keys()).sort((a, b) => {
      if (a === "anthropic") return -1;
      if (b === "anthropic") return 1;
      if (a === "openai") return -1;
      if (b === "openai") return 1;
      return a.localeCompare(b);
    });
    return sortedVendors.map((vendor) => ({
      vendor,
      models: grouped.get(vendor)!,
    }));
  }, [models]);

  const toggleDependency = useCallback((taskId: Id<"orchestrationTasks">) => {
    setSelectedDependencies((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      const taskId = await convex.mutation(api.orchestrationQueries.createTask, {
        teamSlugOrId,
        prompt,
        priority,
        dependencies: selectedDependencies.size > 0 ? Array.from(selectedDependencies) : undefined,
        metadata: selectedModel ? { agentName: selectedModel } : undefined,
      });
      return taskId;
    },
    onSuccess: () => {
      toast.success("Task created successfully");
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
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-global-blocking)] bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[var(--z-global-blocking)] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-neutral-200 bg-white p-6 shadow-xl focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
          {/* Close button */}
          <Dialog.Close asChild>
            <button
              type="button"
              className="absolute right-4 top-4 rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/40 dark:hover:bg-neutral-800 dark:hover:text-white"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </Dialog.Close>

          <Dialog.Title className="text-lg font-semibold text-neutral-900 dark:text-white">
            Spawn Agent Task
          </Dialog.Title>

          <Dialog.Description className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Create a new orchestration task. The background worker will assign it to an available agent.
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
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
              <div className="flex items-center justify-between">
                <label
                  htmlFor="model"
                  className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
                >
                  Agent Model (Optional)
                </label>
                <Link
                  to="/$teamSlugOrId/settings"
                  params={{ teamSlugOrId }}
                  search={{ section: "agent-configs" }}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  <Settings className="size-3" />
                  Configure
                </Link>
              </div>
              <select
                id="model"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              >
                <option value="">Auto-select</option>
                {modelsByVendor.map(({ vendor, models: vendorModels }) => (
                  <optgroup key={vendor} label={vendor.charAt(0).toUpperCase() + vendor.slice(1)}>
                    {vendorModels.map((model) => (
                      <option key={model._id} value={model.name}>
                        {model.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="mt-1 text-xs text-neutral-500">
                Leave empty to let the worker select the best available agent
              </p>
            </div>

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

            {/* Dependency selector */}
            {dependencyOptions.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Dependencies (Optional)
                </label>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  This task will wait for selected tasks to complete
                </p>
                <div className="mt-2 max-h-40 overflow-y-auto rounded-md border border-neutral-300 dark:border-neutral-700">
                  {dependencyOptions.map((task) => {
                    const isSelected = selectedDependencies.has(task._id);
                    const status = task.status as TaskStatus;
                    const config = STATUS_CONFIG[status];
                    return (
                      <button
                        key={task._id}
                        type="button"
                        onClick={() => toggleDependency(task._id)}
                        className={`flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800 ${
                          isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                        }`}
                      >
                        <div
                          className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border ${
                            isSelected
                              ? "border-blue-600 bg-blue-600 dark:border-blue-500 dark:bg-blue-500"
                              : "border-neutral-300 dark:border-neutral-600"
                          }`}
                        >
                          {isSelected && <Check className="size-3 text-white" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium ${config.bgColor} ${config.color}`}
                            >
                              {config.label}
                            </span>
                            {task.assignedAgentName && (
                              <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                                {task.assignedAgentName}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-neutral-700 dark:text-neutral-300">
                            {task.prompt.length > PROMPT_PREVIEW_MAX_LENGTH
                              ? task.prompt.slice(0, PROMPT_PREVIEW_MAX_LENGTH) + "..."
                              : task.prompt}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {selectedDependencies.size > 0 && (
                  <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                    {selectedDependencies.size} task{selectedDependencies.size !== 1 ? "s" : ""} selected
                  </p>
                )}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={createTaskMutation.isPending || !prompt.trim()}
                className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                {createTaskMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Task"
                )}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
