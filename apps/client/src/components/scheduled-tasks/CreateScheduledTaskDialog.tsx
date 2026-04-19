import { useState } from "react";
import { api } from "@cmux/convex/api";
import { useMutation } from "convex/react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_AGENT_NAME,
  AGENT_OPTIONS,
  SCHEDULE_TYPE_OPTIONS,
  DAY_OPTIONS,
} from "./shared";

interface CreateScheduledTaskDialogProps {
  teamSlugOrId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateScheduledTaskDialog({
  teamSlugOrId,
  open,
  onOpenChange,
  onCreated,
}: CreateScheduledTaskDialogProps) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [agentName, setAgentName] = useState(DEFAULT_AGENT_NAME);
  const [repoFullName, setRepoFullName] = useState("");
  const [scheduleType, setScheduleType] = useState<"interval" | "daily" | "weekly" | "cron">("daily");
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [hourUTC, setHourUTC] = useState(9);
  const [minuteUTC, setMinuteUTC] = useState(0);
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [cronExpression, setCronExpression] = useState("0 9 * * 1-5");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createTask = useMutation(api.scheduledTasks.create);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !prompt.trim()) return;

    setIsSubmitting(true);
    try {
      await createTask({
        teamSlugOrId,
        name: name.trim(),
        prompt: prompt.trim(),
        agentName,
        repoFullName: repoFullName.trim() || undefined,
        scheduleType,
        intervalMinutes: scheduleType === "interval" ? intervalMinutes : undefined,
        hourUTC: scheduleType === "daily" || scheduleType === "weekly" ? hourUTC : undefined,
        minuteUTC: scheduleType === "daily" || scheduleType === "weekly" ? minuteUTC : undefined,
        dayOfWeek: scheduleType === "weekly" ? dayOfWeek : undefined,
        cronExpression: scheduleType === "cron" ? cronExpression : undefined,
      });
      resetForm();
      onCreated();
    } catch (error) {
      console.error("Failed to create scheduled task:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setName("");
    setPrompt("");
    setAgentName(DEFAULT_AGENT_NAME);
    setRepoFullName("");
    setScheduleType("daily");
    setIntervalMinutes(60);
    setHourUTC(9);
    setMinuteUTC(0);
    setDayOfWeek(1);
    setCronExpression("0 9 * * 1-5");
  };

  const selectClassName = "w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const inputClassName = "w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const labelClassName = "block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
          <Dialog.Close asChild>
            <button
              type="button"
              className="absolute right-4 top-4 rounded-md p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <X className="size-4" />
            </button>
          </Dialog.Close>

          <Dialog.Title className="text-lg font-semibold">
            Create Scheduled Task
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-neutral-500">
            Set up a recurring task that runs an agent on a schedule
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className={labelClassName}>Task Name</label>
              <input
                type="text"
                placeholder="e.g., Daily code review"
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                className={inputClassName}
                required
              />
            </div>

            <div>
              <label className={labelClassName}>Prompt</label>
              <textarea
                placeholder="What should the agent do?"
                value={prompt}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value)}
                rows={3}
                className={inputClassName}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClassName}>Agent</label>
                <select
                  value={agentName}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAgentName(e.target.value)}
                  className={selectClassName}
                >
                  {AGENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClassName}>Repository (optional)</label>
                <input
                  type="text"
                  placeholder="owner/repo"
                  value={repoFullName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRepoFullName(e.target.value)}
                  className={inputClassName}
                />
              </div>
            </div>

            <div>
              <label className={labelClassName}>Schedule</label>
              <select
                value={scheduleType}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setScheduleType(e.target.value as typeof scheduleType)}
                className={selectClassName}
              >
                {SCHEDULE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {scheduleType === "interval" && (
              <div>
                <label className={labelClassName}>Interval (minutes)</label>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={intervalMinutes}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIntervalMinutes(parseInt(e.target.value) || 60)}
                  className={inputClassName}
                />
              </div>
            )}

            {(scheduleType === "daily" || scheduleType === "weekly") && (
              <div className="grid grid-cols-2 gap-4">
                {scheduleType === "weekly" && (
                  <div>
                    <label className={labelClassName}>Day of Week</label>
                    <select
                      value={dayOfWeek.toString()}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDayOfWeek(parseInt(e.target.value))}
                      className={selectClassName}
                    >
                      {DAY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className={labelClassName}>Time (UTC)</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={hourUTC}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHourUTC(parseInt(e.target.value) || 0)}
                      className={`${inputClassName} w-20`}
                      placeholder="HH"
                    />
                    <span className="text-neutral-500">:</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={minuteUTC}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMinuteUTC(parseInt(e.target.value) || 0)}
                      className={`${inputClassName} w-20`}
                      placeholder="MM"
                    />
                  </div>
                </div>
              </div>
            )}

            {scheduleType === "cron" && (
              <div>
                <label className={labelClassName}>Cron Expression</label>
                <input
                  type="text"
                  placeholder="0 9 * * 1-5"
                  value={cronExpression}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCronExpression(e.target.value)}
                  className={inputClassName}
                />
                <p className="text-xs text-neutral-500 mt-1">
                  Format: minute hour day-of-month month day-of-week
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || !name || !prompt}>
                {isSubmitting ? "Creating..." : "Create Task"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
