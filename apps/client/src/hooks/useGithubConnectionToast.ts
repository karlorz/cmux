import {
  DEFAULT_GITHUB_CONNECTION_REQUIRED_MESSAGE,
  GITHUB_CONNECTION_REQUIRED_ERROR_TOKEN,
} from "@cmux/shared";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { toast } from "sonner";

export function useGithubConnectionToast(teamSlugOrId: string) {
  const navigate = useNavigate();

  return useCallback(
    (rawMessage?: string) => {
      const normalized = (rawMessage ?? "")
        .replace(GITHUB_CONNECTION_REQUIRED_ERROR_TOKEN, "")
        .trim();
      const message =
        normalized.length > 0
          ? normalized
          : DEFAULT_GITHUB_CONNECTION_REQUIRED_MESSAGE;

      toast.error(message, {
        duration: 8000,
        action: {
          label: "Connect GitHub",
          onClick: () => {
            void navigate({
              to: "/$teamSlugOrId/settings",
              params: { teamSlugOrId },
            });
          },
        },
      });
    },
    [navigate, teamSlugOrId],
  );
}
