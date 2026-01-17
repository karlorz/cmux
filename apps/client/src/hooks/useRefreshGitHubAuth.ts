import { useMutation } from "@tanstack/react-query";
import {
  type Options,
  type PostApiMorphTaskRunsByTaskRunIdRefreshGithubAuthData,
  type PostApiMorphTaskRunsByTaskRunIdRefreshGithubAuthResponse,
  type PostApiPveLxcTaskRunsByTaskRunIdRefreshGithubAuthData,
  type PostApiPveLxcTaskRunsByTaskRunIdRefreshGithubAuthResponse,
} from "@cmux/www-openapi-client";
import {
  postApiMorphTaskRunsByTaskRunIdRefreshGithubAuthMutation,
  postApiPveLxcTaskRunsByTaskRunIdRefreshGithubAuthMutation,
} from "@cmux/www-openapi-client/react-query";
import { type Id } from "@cmux/convex/dataModel";
import { toast } from "sonner";

type RefreshGithubAuthVariables =
  | Options<PostApiMorphTaskRunsByTaskRunIdRefreshGithubAuthData>
  | Options<PostApiPveLxcTaskRunsByTaskRunIdRefreshGithubAuthData>;

type RefreshGithubAuthResponse =
  | PostApiMorphTaskRunsByTaskRunIdRefreshGithubAuthResponse
  | PostApiPveLxcTaskRunsByTaskRunIdRefreshGithubAuthResponse;

type SupportedProvider = "morph" | "pve-lxc";

interface UseRefreshGitHubAuthArgs {
  taskRunId: Id<"taskRuns">;
  teamSlugOrId: string;
  provider: SupportedProvider | undefined;
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

export function useRefreshGitHubAuth({
  taskRunId,
  provider,
  onSuccess,
  onError,
}: UseRefreshGitHubAuthArgs) {
  const morphMutation =
    postApiMorphTaskRunsByTaskRunIdRefreshGithubAuthMutation();
  const pveMutation =
    postApiPveLxcTaskRunsByTaskRunIdRefreshGithubAuthMutation();

  const selectedMutation =
    provider === "pve-lxc"
      ? pveMutation
      : provider === "morph"
        ? morphMutation
        : undefined;

  return useMutation<
    RefreshGithubAuthResponse,
    Error,
    RefreshGithubAuthVariables,
    { toastId: string | number }
  >({
    ...(selectedMutation ?? morphMutation),
    mutationKey: ["refresh-github-auth", provider ?? "unknown", "task-run", taskRunId],
    mutationFn:
      selectedMutation?.mutationFn ??
      (async () => {
        throw new Error("Unsupported provider for GitHub auth refresh");
      }),
    onMutate: async () => {
      const toastId = toast.loading("Refreshing GitHub authentication…");
      return { toastId };
    },
    onSuccess: (_data, __, context) => {
      toast.success("GitHub authentication refreshed", { id: context?.toastId });
      onSuccess?.();
    },
    onError: (error, _variables, context) => {
      let message = "Failed to refresh GitHub auth.";
      if (error instanceof Error) {
        const lowered = error.message.toLowerCase();
        if (error.message.includes("409") || lowered.includes("paused") || lowered.includes("stopped")) {
          message = "Workspace is stopped. Resume it first.";
        } else if (error.message.includes("401") || error.message.includes("GitHub")) {
          message = "GitHub account not connected. Check your settings.";
        } else {
          message = error.message;
        }
      }
      toast.error(message, { id: context?.toastId });
      onError?.(error);
    },
  });
}
