import { isElectron } from "@/lib/electron";
import { WWW_ORIGIN } from "@/lib/wwwOrigin";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@stackframe/react";
import { useCallback, useState } from "react";
import { z } from "zod";
import { SettingInput } from "@/components/settings/SettingInput";
import { SettingSection } from "@/components/settings/SettingSection";

const GitHubUserSchema = z.object({
  login: z.string(),
});

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function ConnectedAccountsSection({ teamSlugOrId }: { teamSlugOrId: string }) {
  const user = useUser({ or: "return-null" });
  const [isConnecting, setIsConnecting] = useState(false);

  const { data: githubAccount, isLoading: isCheckingConnection } = useQuery({
    queryKey: ["github-connection", user?.id],
    queryFn: async () => {
      if (!user) return { connected: false, username: null };
      const account = await user.getConnectedAccount("github");
      if (!account) return { connected: false, username: null };

      try {
        const token = await account.getAccessToken();
        if (!token.accessToken) return { connected: true, username: null };

        const response = await fetch("https://api.github.com/user", {
          headers: { Authorization: `Bearer ${token.accessToken}` },
        });

        if (!response.ok) return { connected: true, username: null };

        const parsed = GitHubUserSchema.safeParse(await response.json());
        if (!parsed.success) return { connected: true, username: null };

        return { connected: true, username: parsed.data.login };
      } catch (err) {
        console.error("Failed to fetch GitHub username:", err);
        return { connected: true, username: null };
      }
    },
    enabled: !!user,
  });

  const githubConnected = isCheckingConnection
    ? null
    : (githubAccount?.connected ?? false);
  const githubUsername = githubAccount?.username ?? null;

  const handleConnectGitHub = useCallback(async () => {
    if (!user) return;

    setIsConnecting(true);
    try {
      if (isElectron) {
        const oauthUrl = `${WWW_ORIGIN}/handler/connect-github?team=${encodeURIComponent(teamSlugOrId)}`;
        window.open(oauthUrl, "_blank", "noopener,noreferrer");
        return;
      }

      await user.getConnectedAccount("github", { or: "redirect" });
    } catch (error) {
      console.error("Failed to connect GitHub:", error);
    } finally {
      setIsConnecting(false);
    }
  }, [teamSlugOrId, user]);

  if (!user) return null;

  return (
    <SettingSection
      title="Connected Accounts"
      description="Connect accounts to enable additional features like private repo access."
    >
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 bg-neutral-100 dark:bg-neutral-800 rounded-lg flex items-center justify-center">
              <GitHubIcon className="w-4.5 h-4.5 text-neutral-700 dark:text-neutral-300" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                GitHub
              </p>
              {githubConnected === null ? (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Checking...
                </p>
              ) : githubConnected ? (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Connected{githubUsername ? ` as @${githubUsername}` : ""}
                </p>
              ) : (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Required for private repo access and higher API rate limits
                </p>
              )}
            </div>
          </div>

          {githubConnected === false ? (
            <button
              type="button"
              onClick={handleConnectGitHub}
              disabled={isConnecting}
              className="px-3 py-1.5 text-xs font-medium text-white bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 rounded-md hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isConnecting ? "Connecting..." : "Connect"}
            </button>
          ) : null}

          {githubConnected === true ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400">
              Connected
            </span>
          ) : null}
        </div>
      </div>
    </SettingSection>
  );
}

interface GeneralSectionProps {
  teamSlugOrId: string;
  teamName: string;
  teamNameError: string;
  onTeamNameChange: (value: string) => void;
  onSaveTeamName: () => void;
  canSaveTeamName: boolean;
  teamSlug: string;
  teamSlugError: string;
  onTeamSlugChange: (value: string) => void;
  onSaveTeamSlug: () => void;
  canSaveTeamSlug: boolean;
  isSaving: boolean;
}

export function GeneralSection({
  teamSlugOrId,
  teamName,
  teamNameError,
  onTeamNameChange,
  onSaveTeamName,
  canSaveTeamName,
  teamSlug,
  teamSlugError,
  onTeamSlugChange,
  onSaveTeamSlug,
  canSaveTeamSlug,
  isSaving,
}: GeneralSectionProps) {
  return (
    <div className="space-y-4">
      <SettingSection title="Team Name">
        <SettingInput
          id="teamName"
          label="Display Name"
          description="How your team is displayed across cmux."
          value={teamName}
          onChange={onTeamNameChange}
          placeholder="Your Team"
          error={teamNameError}
          noBorder
        />
        <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-end">
          <button
            type="button"
            className="px-3 py-1.5 text-sm rounded-md bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 disabled:opacity-50"
            disabled={isSaving || !canSaveTeamName}
            onClick={onSaveTeamName}
          >
            Save
          </button>
        </div>
      </SettingSection>

      <SettingSection title="Team URL">
        <SettingInput
          id="teamSlug"
          label="URL Slug"
          description="Set the slug used in links, e.g. /your-team/dashboard. Lowercase letters, numbers, and hyphens. 3-48 characters."
          value={teamSlug}
          onChange={onTeamSlugChange}
          placeholder="your-team"
          prefix="cmux.dev/"
          error={teamSlugError}
          noBorder
        />
        <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-end">
          <button
            type="button"
            className="px-3 py-1.5 text-sm rounded-md bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 disabled:opacity-50"
            disabled={isSaving || !canSaveTeamSlug}
            onClick={onSaveTeamSlug}
          >
            Save
          </button>
        </div>
      </SettingSection>

      <ConnectedAccountsSection teamSlugOrId={teamSlugOrId} />
    </div>
  );
}
