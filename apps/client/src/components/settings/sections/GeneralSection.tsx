import { env } from "@/client-env";
import { useTheme } from "@/components/theme/use-theme";
import { useOnboardingOptional } from "@/contexts/onboarding";
import { ContainerSettings } from "@/components/ContainerSettings";
import { EditorSettingsSection } from "@/components/EditorSettingsSection";
import { ProviderStatusSettings } from "@/components/provider-status-settings";
import { SettingSection, SettingSegmented, SettingSwitch } from "../index";
import { HelpCircle, ChevronDown } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useUser } from "@stackframe/react";
import { isElectron } from "@/lib/electron";
import { WWW_ORIGIN } from "@/lib/wwwOrigin";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

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

interface HeatmapColors {
  line: { start: string; end: string };
  token: { start: string; end: string };
}

interface GeneralSectionProps {
  teamSlugOrId: string;
  // Team Name/URL
  teamName: string;
  onTeamNameChange: (value: string) => void;
  teamNameError: string;
  onSaveTeamName: () => void;
  teamSlug: string;
  onTeamSlugChange: (value: string) => void;
  teamSlugError: string;
  onSaveTeamSlug: () => void;
  originalTeamName: string;
  originalTeamSlug: string;
  // Workspace
  worktreePath: string;
  onWorktreePathChange: (value: string) => void;
  autoPrEnabled: boolean;
  onAutoPrEnabledChange: (value: boolean) => void;
  // Heatmap
  heatmapModel: string;
  onHeatmapModelChange: (value: string) => void;
  heatmapTooltipLanguage: string;
  onHeatmapTooltipLanguageChange: (value: string) => void;
  heatmapThreshold: number;
  onHeatmapThresholdChange: (value: number) => void;
  heatmapColors: HeatmapColors;
  onHeatmapColorsChange: (colors: HeatmapColors) => void;
  // Container settings
  onContainerSettingsChange: (data: {
    maxRunningContainers: number;
    reviewPeriodMinutes: number;
    autoCleanupEnabled: boolean;
    stopImmediatelyOnCompletion: boolean;
    minContainersToKeep: number;
  }) => void;
  // State
  isSaving: boolean;
  validateName: (val: string) => string;
  validateSlug: (val: string) => string;
}

// Heatmap model options
const HEATMAP_MODEL_OPTIONS = [
  { value: "anthropic-opus-4-5", label: "Claude Opus 4.5" },
  { value: "anthropic", label: "Claude Opus 4.1" },
  { value: "cmux-heatmap-2", label: "cmux-heatmap-2" },
  { value: "cmux-heatmap-1", label: "cmux-heatmap-1" },
];

// Tooltip language options
const TOOLTIP_LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "zh-Hant", label: "Traditional Chinese" },
  { value: "zh-Hans", label: "Simplified Chinese" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "pt", label: "Portuguese" },
  { value: "ru", label: "Russian" },
  { value: "vi", label: "Vietnamese" },
  { value: "th", label: "Thai" },
  { value: "id", label: "Indonesian" },
];

function ConnectedAccountsContent({ teamSlugOrId }: { teamSlugOrId: string }) {
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
  }, [user, teamSlugOrId]);

  if (!user) return null;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-neutral-100 dark:bg-neutral-800 rounded-lg flex items-center justify-center">
            <GitHubIcon className="w-4.5 h-4.5 text-neutral-700 dark:text-neutral-300" />
          </div>
          <div>
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
        {githubConnected === false && (
          <button
            onClick={handleConnectGitHub}
            disabled={isConnecting}
            className="px-3 py-1.5 text-xs font-medium text-white bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 rounded-md hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isConnecting ? "Connecting..." : "Connect"}
          </button>
        )}
        {githubConnected === true && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400">
            Connected
          </span>
        )}
      </div>
    </div>
  );
}

function OnboardingTourContent({ teamSlugOrId }: { teamSlugOrId: string }) {
  const onboarding = useOnboardingOptional();
  const navigate = useNavigate();

  const handleStartTour = useCallback(async () => {
    if (!onboarding) return;
    onboarding.resetOnboarding();
    try {
      await navigate({
        to: "/$teamSlugOrId/dashboard",
        params: { teamSlugOrId },
      });
    } catch (error) {
      console.error("Failed to navigate to dashboard for onboarding:", error);
      return;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });
    onboarding.startOnboarding();
  }, [navigate, onboarding, teamSlugOrId]);

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
            <HelpCircle className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              Product Tour
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Take a guided tour of cmux to learn about its features.
            </p>
          </div>
        </div>
        <button
          onClick={handleStartTour}
          className="px-3 py-1.5 text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md transition-colors flex-shrink-0"
        >
          Start Tour
        </button>
      </div>
    </div>
  );
}

export function GeneralSection({
  teamSlugOrId,
  teamName,
  onTeamNameChange,
  teamNameError,
  onSaveTeamName,
  teamSlug,
  onTeamSlugChange,
  teamSlugError,
  onSaveTeamSlug,
  originalTeamName,
  originalTeamSlug,
  worktreePath,
  onWorktreePathChange,
  autoPrEnabled,
  onAutoPrEnabledChange,
  heatmapModel,
  onHeatmapModelChange,
  heatmapTooltipLanguage,
  onHeatmapTooltipLanguageChange,
  heatmapThreshold,
  onHeatmapThresholdChange,
  heatmapColors,
  onHeatmapColorsChange,
  onContainerSettingsChange,
  isSaving,
  validateName,
  validateSlug,
}: GeneralSectionProps) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <div className="space-y-4">
      {/* Team Name */}
      <SettingSection title="Team Name">
        <div className="p-4">
          <label
            htmlFor="teamName"
            className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
          >
            Display Name
          </label>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
            How your team is displayed across cmux.
          </p>
          <input
            type="text"
            id="teamName"
            value={teamName}
            onChange={(e) => onTeamNameChange(e.target.value)}
            placeholder="Your Team"
            aria-invalid={teamNameError ? true : undefined}
            aria-describedby={teamNameError ? "team-name-error" : undefined}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 ${
              teamNameError
                ? "border-red-500 focus:ring-red-500"
                : "border-neutral-300 dark:border-neutral-700 focus:ring-blue-500"
            }`}
          />
          {teamNameError && (
            <p
              id="team-name-error"
              className="mt-2 text-xs text-red-600 dark:text-red-500"
            >
              {teamNameError}
            </p>
          )}
        </div>
        <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-end">
          <button
            className="px-3 py-1.5 text-sm rounded-md bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 disabled:opacity-50"
            disabled={
              isSaving ||
              teamName.trim() === originalTeamName.trim() ||
              Boolean(teamNameError) ||
              validateName(teamName) !== ""
            }
            onClick={onSaveTeamName}
          >
            Save
          </button>
        </div>
      </SettingSection>

      {/* Team URL */}
      <SettingSection title="Team URL">
        <div className="p-4">
          <label
            htmlFor="teamSlug"
            className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
          >
            URL Slug
          </label>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
            Set the slug used in links, e.g. /your-team/dashboard. Lowercase
            letters, numbers, and hyphens. 3-48 characters.
          </p>
          <div
            className={`inline-flex items-center w-full rounded-lg bg-white dark:bg-neutral-900 border ${
              teamSlugError
                ? "border-red-500"
                : "border-neutral-300 dark:border-neutral-700"
            }`}
          >
            <span
              aria-hidden
              className="px-3 py-2 text-sm text-neutral-500 dark:text-neutral-400 select-none bg-neutral-50 dark:bg-neutral-800/50 border-r border-neutral-200 dark:border-neutral-700 rounded-l-lg"
            >
              cmux.dev/
            </span>
            <input
              id="teamSlug"
              aria-label="Team slug"
              type="text"
              value={teamSlug}
              onChange={(e) => onTeamSlugChange(e.target.value.toLowerCase())}
              placeholder="your-team"
              aria-invalid={teamSlugError ? true : undefined}
              aria-describedby={teamSlugError ? "team-slug-error" : undefined}
              className="flex-1 bg-transparent border-0 outline-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 rounded-r-lg"
            />
          </div>
          {teamSlugError && (
            <p
              id="team-slug-error"
              className="mt-2 text-xs text-red-600 dark:text-red-500"
            >
              {teamSlugError}
            </p>
          )}
        </div>
        <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-end">
          <button
            className="px-3 py-1.5 text-sm rounded-md bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 disabled:opacity-50"
            disabled={
              isSaving ||
              teamSlug.trim() === originalTeamSlug.trim() ||
              Boolean(teamSlugError) ||
              validateSlug(teamSlug) !== ""
            }
            onClick={onSaveTeamSlug}
          >
            Save
          </button>
        </div>
      </SettingSection>

      {/* Connected Accounts */}
      <SettingSection
        title="Connected Accounts"
        description="Connect accounts to enable additional features like private repo access"
      >
        <ConnectedAccountsContent teamSlugOrId={teamSlugOrId} />
      </SettingSection>

      {/* Appearance */}
      <SettingSection title="Appearance">
        <SettingSegmented
          label="Theme"
          description="Choose your preferred color scheme"
          value={resolvedTheme}
          onChange={(value) => setTheme(value as "light" | "dark" | "system")}
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
            { value: "system", label: "System" },
          ]}
        />
      </SettingSection>

      {/* Getting Started */}
      <SettingSection title="Getting Started">
        <OnboardingTourContent teamSlugOrId={teamSlugOrId} />
      </SettingSection>

      {/* Crown Evaluator */}
      <SettingSection title="Crown Evaluator">
        <SettingSwitch
          label="Auto-create pull request with the best diff"
          description="After all agents finish, automatically create a pull request with the winning agent's solution."
          checked={autoPrEnabled}
          onChange={onAutoPrEnabledChange}
        />
      </SettingSection>

      {/* Heatmap Review */}
      <SettingSection title="Diff Heatmap Review">
        <div className="p-4 space-y-6">
          {/* Model Selector */}
          <div>
            <label
              htmlFor="heatmapModel"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
            >
              Review Model
            </label>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
              Select the AI model used to analyze diffs and highlight areas that
              need attention.
            </p>
            <div className="relative">
              <select
                id="heatmapModel"
                value={heatmapModel}
                onChange={(e) => onHeatmapModelChange(e.target.value)}
                className="w-full appearance-none px-3 py-2 pr-10 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 text-sm"
              >
                {HEATMAP_MODEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500 dark:text-neutral-400"
                aria-hidden
              />
            </div>
          </div>

          {/* Tooltip Language Selector */}
          <div>
            <label
              htmlFor="heatmapTooltipLanguage"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
            >
              Tooltip Language
            </label>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
              Language for the review comments shown in heatmap tooltips.
            </p>
            <div className="relative">
              <select
                id="heatmapTooltipLanguage"
                value={heatmapTooltipLanguage}
                onChange={(e) => onHeatmapTooltipLanguageChange(e.target.value)}
                className="w-full appearance-none px-3 py-2 pr-10 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 text-sm"
              >
                {TOOLTIP_LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500 dark:text-neutral-400"
                aria-hidden
              />
            </div>
          </div>

          {/* Threshold Slider */}
          <div>
            <label
              htmlFor="heatmapThreshold"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
            >
              Visibility Threshold: {Math.round(heatmapThreshold * 100)}%
            </label>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
              Only show highlights for lines with a review score above this
              threshold.
            </p>
            <input
              type="range"
              id="heatmapThreshold"
              min="0"
              max="1"
              step="0.05"
              value={heatmapThreshold}
              onChange={(e) =>
                onHeatmapThresholdChange(Number.parseFloat(e.target.value))
              }
              className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>

          {/* Color Settings */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Heatmap Colors
            </label>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
              Customize the gradient colors for line and token highlighting.
            </p>
            <div className="grid grid-cols-2 gap-4">
              {/* Line Background Colors */}
              <div className="space-y-2">
                <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  Line Background
                </span>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-neutral-500 dark:text-neutral-400 w-10">
                    Low
                  </label>
                  <input
                    type="color"
                    value={heatmapColors.line.start}
                    onChange={(e) =>
                      onHeatmapColorsChange({
                        ...heatmapColors,
                        line: { ...heatmapColors.line, start: e.target.value },
                      })
                    }
                    className="w-8 h-8 rounded border border-neutral-300 dark:border-neutral-600 cursor-pointer"
                  />
                  <span className="text-xs font-mono text-neutral-500">
                    {heatmapColors.line.start}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-neutral-500 dark:text-neutral-400 w-10">
                    High
                  </label>
                  <input
                    type="color"
                    value={heatmapColors.line.end}
                    onChange={(e) =>
                      onHeatmapColorsChange({
                        ...heatmapColors,
                        line: { ...heatmapColors.line, end: e.target.value },
                      })
                    }
                    className="w-8 h-8 rounded border border-neutral-300 dark:border-neutral-600 cursor-pointer"
                  />
                  <span className="text-xs font-mono text-neutral-500">
                    {heatmapColors.line.end}
                  </span>
                </div>
              </div>
              {/* Token Highlight Colors */}
              <div className="space-y-2">
                <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  Token Highlight
                </span>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-neutral-500 dark:text-neutral-400 w-10">
                    Low
                  </label>
                  <input
                    type="color"
                    value={heatmapColors.token.start}
                    onChange={(e) =>
                      onHeatmapColorsChange({
                        ...heatmapColors,
                        token: {
                          ...heatmapColors.token,
                          start: e.target.value,
                        },
                      })
                    }
                    className="w-8 h-8 rounded border border-neutral-300 dark:border-neutral-600 cursor-pointer"
                  />
                  <span className="text-xs font-mono text-neutral-500">
                    {heatmapColors.token.start}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-neutral-500 dark:text-neutral-400 w-10">
                    High
                  </label>
                  <input
                    type="color"
                    value={heatmapColors.token.end}
                    onChange={(e) =>
                      onHeatmapColorsChange({
                        ...heatmapColors,
                        token: { ...heatmapColors.token, end: e.target.value },
                      })
                    }
                    className="w-8 h-8 rounded border border-neutral-300 dark:border-neutral-600 cursor-pointer"
                  />
                  <span className="text-xs font-mono text-neutral-500">
                    {heatmapColors.token.end}
                  </span>
                </div>
              </div>
            </div>
            {/* Preview Gradient */}
            <div className="mt-4">
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                Preview
              </span>
              <div
                className="mt-1 h-4 rounded"
                style={{
                  background: `linear-gradient(to right, ${heatmapColors.line.start}, ${heatmapColors.line.end})`,
                }}
              />
            </div>
          </div>
        </div>
      </SettingSection>

      {/* Worktree Location - hidden in web mode */}
      {!env.NEXT_PUBLIC_WEB_MODE && (
        <SettingSection title="Worktree Location">
          <div className="p-4">
            <label
              htmlFor="worktreePath"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
            >
              Custom Worktree Path
            </label>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
              Specify where to store git worktrees. Leave empty to use the
              default location. You can use ~ for your home directory.
            </p>
            <input
              type="text"
              id="worktreePath"
              value={worktreePath}
              onChange={(e) => onWorktreePathChange(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100"
              placeholder="~/my-custom-worktrees"
              autoComplete="off"
            />
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
              Default location: ~/cmux
            </p>
          </div>
        </SettingSection>
      )}

      {/* Provider Status - hidden in web mode */}
      {!env.NEXT_PUBLIC_WEB_MODE && (
        <SettingSection title="Provider Status">
          <div className="p-4">
            <ProviderStatusSettings />
          </div>
        </SettingSection>
      )}

      {/* Container Settings - hidden in web mode */}
      {!env.NEXT_PUBLIC_WEB_MODE && (
        <SettingSection title="Container Management">
          <div className="p-4">
            <ContainerSettings
              teamSlugOrId={teamSlugOrId}
              onDataChange={onContainerSettingsChange}
            />
          </div>
        </SettingSection>
      )}

      {/* Editor Settings Sync - web mode only */}
      {env.NEXT_PUBLIC_WEB_MODE && (
        <EditorSettingsSection teamSlugOrId={teamSlugOrId} />
      )}
    </div>
  );
}
