import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send } from "lucide-react";
import type { Id } from "@cmux/convex/dataModel";
import { postApiOrchestrateMessageMutation } from "@cmux/www-openapi-client/react-query";
import { FormDialog } from "@/components/ui/form-dialog";

interface OrchestrationMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamSlugOrId: string;
  taskRunId: Id<"taskRuns">;
  agentName: string;
}

const MESSAGE_TYPES = [
  { value: "request", label: "Request", description: "Ask the agent to do something" },
  { value: "status", label: "Status", description: "Share a status update" },
  { value: "handoff", label: "Handoff", description: "Transfer work to another agent" },
] as const;

export function OrchestrationMessageDialog({
  open,
  onOpenChange,
  teamSlugOrId,
  taskRunId,
  agentName,
}: OrchestrationMessageDialogProps) {
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"request" | "status" | "handoff">("request");

  const sendMessageMutation = useMutation({
    ...postApiOrchestrateMessageMutation(),
    onSuccess: () => {
      toast.success("Message sent to agent");
      setMessage("");
      setMessageType("request");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(`Failed to send message: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      toast.error("Please enter a message");
      return;
    }
    sendMessageMutation.mutate({
      body: {
        taskRunId: String(taskRunId),
        message,
        messageType,
        teamSlugOrId,
      },
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Send Message to ${agentName}`}
      description="Send a message to the running agent via its mailbox."
      submitLabel="Send Message"
      submitIcon={<Send className="size-4" />}
      onSubmit={handleSubmit}
      isLoading={sendMessageMutation.isPending}
      loadingLabel="Sending..."
      isSubmitDisabled={!message.trim()}
    >
      {/* Message Type */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Message Type
        </label>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {MESSAGE_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => setMessageType(type.value)}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                messageType === type.value
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                  : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600"
              }`}
            >
              <div className="font-medium text-neutral-900 dark:text-neutral-100">
                {type.label}
              </div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {type.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Message */}
      <div>
        <label
          htmlFor="message"
          className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
        >
          Message
        </label>
        <textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          placeholder="Enter your message..."
        />
      </div>
    </FormDialog>
  );
}
