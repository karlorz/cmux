import { postApiMorphResumeInstanceMutation } from "@cmux/www-openapi-client/react-query";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCallback, useRef } from "react";

interface UseForceWakeVMOptions {
  teamSlugOrId: string;
  taskRunId: string;
}

export function useForceWakeVM({ teamSlugOrId, taskRunId }: UseForceWakeVMOptions) {
  const toastIdRef = useRef<string | number | null>(null);

  const mutation = useMutation({
    ...postApiMorphResumeInstanceMutation(),
    onMutate: () => {
      // Show loading toast
      toastIdRef.current = toast.loading("Waking up VM...");
    },
    onSuccess: (data) => {
      // Check if VM is ready or resuming
      if (data.status === "ready") {
        toast.success("VM is already running", {
          id: toastIdRef.current ?? undefined,
        });
      } else {
        toast.success("VM wake initiated successfully", {
          id: toastIdRef.current ?? undefined,
        });
      }
      toastIdRef.current = null;
    },
    onError: (error: Error) => {
      const errorMessage =
        error?.message || "Failed to wake VM";
      toast.error(errorMessage, {
        id: toastIdRef.current ?? undefined,
      });
      toastIdRef.current = null;
    },
  });

  const forceWakeVM = useCallback(() => {
    mutation.mutate({
      body: {
        teamSlugOrId,
        taskRunId,
      },
    });
  }, [mutation, teamSlugOrId, taskRunId]);

  return {
    forceWakeVM,
    isWaking: mutation.isPending,
  };
}
