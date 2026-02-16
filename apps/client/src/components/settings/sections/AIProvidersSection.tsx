import { env } from "@/client-env";
import { ProviderStatusSettings } from "@/components/provider-status-settings";
import { SettingSection } from "@/components/settings/SettingSection";
import { cachedGetUser } from "@/lib/cachedGetUser";
import { stackClientApp } from "@/lib/stack";
import { WWW_ORIGIN } from "@/lib/wwwOrigin";
import { AGENT_CONFIGS, type AgentConfig } from "@cmux/shared/agentConfig";
import {
  ANTHROPIC_BASE_URL_KEY,
  API_KEY_TO_BASE_URL,
  type ProviderBaseUrlKey,
} from "@cmux/shared";
import { API_KEY_MODELS_BY_ENV } from "@cmux/shared/model-usage";
import { Switch } from "@heroui/react";
import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface ProviderInfo {
  url?: string;
  helpText?: string;
}

type ConnectionTestResult = {
  status: "success" | "error";
  message: string;
  details?: {
    statusCode?: number;
    responseTime?: number;
    endpoint: string;
    modelsFound?: number;
  };
};

const PROVIDER_INFO: Record<string, ProviderInfo> = {
  CLAUDE_CODE_OAUTH_TOKEN: {
    helpText:
      "Run `claude setup-token` in your terminal and paste the output here. Preferred over API key.",
  },
  ANTHROPIC_API_KEY: {
    url: "https://console.anthropic.com/settings/keys",
  },
  OPENAI_API_KEY: {
    url: "https://platform.openai.com/api-keys",
  },
  CODEX_AUTH_JSON: {
    helpText:
      "Paste the contents of ~/.codex/auth.json here. This allows Codex to use your OpenAI authentication.",
  },
  OPENROUTER_API_KEY: {
    url: "https://openrouter.ai/keys",
  },
  GEMINI_API_KEY: {
    url: "https://console.cloud.google.com/apis/credentials",
  },
  MODEL_STUDIO_API_KEY: {
    url: "https://modelstudio.console.alibabacloud.com/?tab=playground#/api-key",
  },
  AMP_API_KEY: {
    url: "https://ampcode.com/settings",
  },
  CURSOR_API_KEY: {
    url: "https://cursor.com/dashboard?tab=integrations",
  },
  XAI_API_KEY: {
    url: "https://console.x.ai/",
  },
};

interface AIProvidersSectionProps {
  teamSlugOrId: string;
  apiKeyValues: Record<string, string>;
  setApiKeyValues: (
    value: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)
  ) => void;
  originalApiKeyValues: Record<string, string>;
  showKeys: Record<string, boolean>;
  setShowKeys: (
    value: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)
  ) => void;
  showBaseUrls: boolean;
  setShowBaseUrls: (value: boolean | ((prev: boolean) => boolean)) => void;
  baseUrlValues: Record<string, string>;
  setBaseUrlValues: (
    value: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)
  ) => void;
  originalBaseUrlValues: Record<string, string>;
  bypassAnthropicProxy: boolean;
  setBypassAnthropicProxy: (value: boolean) => void;
  isTestingConnection: Record<string, boolean>;
  setIsTestingConnection: (
    value:
      | Record<string, boolean>
      | ((prev: Record<string, boolean>) => Record<string, boolean>)
  ) => void;
  connectionTestResults: Record<string, ConnectionTestResult | null>;
  setConnectionTestResults: (
    value:
      | Record<string, ConnectionTestResult | null>
      | ((
          prev: Record<string, ConnectionTestResult | null>
        ) => Record<string, ConnectionTestResult | null>)
  ) => void;
}

export function AIProvidersSection({
  teamSlugOrId: _teamSlugOrId,
  apiKeyValues,
  setApiKeyValues,
  originalApiKeyValues,
  showKeys,
  setShowKeys,
  showBaseUrls,
  setShowBaseUrls,
  baseUrlValues,
  setBaseUrlValues,
  originalBaseUrlValues: _originalBaseUrlValues,
  bypassAnthropicProxy,
  setBypassAnthropicProxy,
  isTestingConnection,
  setIsTestingConnection,
  connectionTestResults,
  setConnectionTestResults,
}: AIProvidersSectionProps) {
  const usedListRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const [expandedUsedList, setExpandedUsedList] = useState<
    Record<string, boolean>
  >({});
  const [overflowUsedList, setOverflowUsedList] = useState<
    Record<string, boolean>
  >({});

  // Get all required API keys from agent configs
  const apiKeys = Array.from(
    new Map(
      AGENT_CONFIGS.flatMap((config: AgentConfig) => config.apiKeys || []).map(
        (key) => [key.envVar, key]
      )
    ).values()
  );

  // Global mapping of envVar -> models (from shared)
  const apiKeyModelsByEnv = API_KEY_MODELS_BY_ENV;

  // Recompute overflow detection for "Used for agents" lines
  useEffect(() => {
    const recompute = () => {
      const updates: Record<string, boolean> = {};
      for (const key of Object.keys(usedListRefs.current)) {
        const el = usedListRefs.current[key];
        if (!el) continue;
        updates[key] = el.scrollWidth > el.clientWidth;
      }
      setOverflowUsedList((prev) => {
        let changed = false;
        const next: Record<string, boolean> = { ...prev };
        for (const k of Object.keys(updates)) {
          if (prev[k] !== updates[k]) {
            next[k] = updates[k];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    };

    recompute();
    const handler = () => recompute();
    window.addEventListener("resize", handler);
    const id = window.setTimeout(recompute, 0);
    return () => {
      window.removeEventListener("resize", handler);
      window.clearTimeout(id);
    };
  }, [apiKeys, apiKeyModelsByEnv]);

  const handleApiKeyChange = (envVar: string, value: string) => {
    setApiKeyValues((prev) => ({ ...prev, [envVar]: value }));
  };

  const handleBaseUrlChange = (
    baseUrlKey: ProviderBaseUrlKey,
    value: string
  ) => {
    setBaseUrlValues((prev) => ({ ...prev, [baseUrlKey.envVar]: value }));
    setConnectionTestResults((prev) => ({
      ...prev,
      [baseUrlKey.envVar]: null,
    }));
    if (
      baseUrlKey.envVar === ANTHROPIC_BASE_URL_KEY.envVar &&
      value.trim().length === 0
    ) {
      setBypassAnthropicProxy(false);
    }
  };

  const toggleShowKey = (envVar: string) => {
    setShowKeys((prev) => ({ ...prev, [envVar]: !prev[envVar] }));
  };

  const testBaseUrlConnection = useCallback(
    async (baseUrlKey: ProviderBaseUrlKey, apiKeyEnvVar: string) => {
      const baseUrl = (baseUrlValues[baseUrlKey.envVar] || "").trim();
      const apiKey = (apiKeyValues[apiKeyEnvVar] || "").trim();

      if (!baseUrl) {
        setConnectionTestResults((prev) => ({
          ...prev,
          [baseUrlKey.envVar]: {
            status: "error",
            message: "Enter a base URL before testing.",
          },
        }));
        return;
      }

      if (baseUrlKey.envVar !== ANTHROPIC_BASE_URL_KEY.envVar) {
        setConnectionTestResults((prev) => ({
          ...prev,
          [baseUrlKey.envVar]: {
            status: "error",
            message:
              "Connection testing is currently available for Anthropic only.",
          },
        }));
        return;
      }

      if (!apiKey) {
        setConnectionTestResults((prev) => ({
          ...prev,
          [baseUrlKey.envVar]: {
            status: "error",
            message: "Enter an Anthropic API key before testing.",
          },
        }));
        return;
      }

      setIsTestingConnection((prev) => ({
        ...prev,
        [baseUrlKey.envVar]: true,
      }));
      try {
        const user = await cachedGetUser(stackClientApp);
        if (!user) {
          setConnectionTestResults((prev) => ({
            ...prev,
            [baseUrlKey.envVar]: {
              status: "error",
              message: "You must be signed in to test connections.",
            },
          }));
          return;
        }

        const authHeaders = await user.getAuthHeaders();
        const headers = new Headers(authHeaders);
        headers.set("Content-Type", "application/json");

        const endpoint = new URL(
          "/api/settings/test-anthropic-connection",
          WWW_ORIGIN
        );
        const response = await fetch(endpoint.toString(), {
          method: "POST",
          headers,
          body: JSON.stringify({
            baseUrl,
            apiKey,
          }),
        });

        const payload = (await response.json()) as {
          success: boolean;
          message: string;
          details?: ConnectionTestResult["details"];
        };

        setConnectionTestResults((prev) => ({
          ...prev,
          [baseUrlKey.envVar]: {
            status: payload.success ? "success" : "error",
            message: payload.message,
            details: payload.details,
          },
        }));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Connection test failed";
        setConnectionTestResults((prev) => ({
          ...prev,
          [baseUrlKey.envVar]: {
            status: "error",
            message,
          },
        }));
      } finally {
        setIsTestingConnection((prev) => ({
          ...prev,
          [baseUrlKey.envVar]: false,
        }));
      }
    },
    [
      apiKeyValues,
      baseUrlValues,
      setConnectionTestResults,
      setIsTestingConnection,
    ]
  );

  return (
    <div className="space-y-4">
      {/* AI Provider Authentication */}
      <SettingSection title="AI Provider Authentication">
        <div className="p-4">
          {/* OAuth Providers Notice - hidden for now */}
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg hidden">
            <div className="flex items-start gap-2">
              <svg
                className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="space-y-2">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  OAuth-based providers (Gemini, AMP)
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  These providers use OAuth authentication. When you first run
                  them, they'll open a browser for you to authorize access. No
                  API keys needed.
                </p>
              </div>
            </div>
          </div>

          {/* API Keys Section */}
          <div className="space-y-3">
            {apiKeys.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                No API keys required for the configured agents.
              </p>
            ) : (
              <>
                <div className="mb-3">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      API Key Authentication
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowBaseUrls((prev) => !prev)}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {showBaseUrls ? "Hide more" : "Show more"}
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform ${showBaseUrls ? "rotate-180" : ""}`}
                      />
                    </button>
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 space-y-1">
                    <p>You can authenticate providers in two ways:</p>
                    <ul className="list-disc ml-4 space-y-0.5">
                      <li>
                        Start a coding CLI (Claude Code, Codex CLI, Gemini CLI,
                        Amp, Opencode) and complete its sign-in; cmux reuses
                        that authentication.
                      </li>
                      <li>
                        Or enter API keys here and cmux will use them directly.
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Group API keys by provider for better organization */}
                {apiKeys.map((key) => {
                  const providerInfo = PROVIDER_INFO[key.envVar];
                  const usedModels = apiKeyModelsByEnv[key.envVar] ?? [];
                  const baseUrlKey = API_KEY_TO_BASE_URL[key.envVar];
                  const baseUrlValue = baseUrlKey
                    ? baseUrlValues[baseUrlKey.envVar] || ""
                    : "";
                  const hasBaseUrlValue = baseUrlValue.trim().length > 0;
                  const connectionResult = baseUrlKey
                    ? connectionTestResults[baseUrlKey.envVar]
                    : null;

                  return (
                    <div
                      key={key.envVar}
                      className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 space-y-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div className="min-w-0">
                            <label
                              htmlFor={key.envVar}
                              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
                            >
                              {key.displayName}
                            </label>
                            {providerInfo?.helpText && (
                              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                                {providerInfo.helpText}
                              </p>
                            )}
                            {usedModels.length > 0 && (
                              <div className="mt-1 space-y-1">
                                <div className="flex items-center gap-2 min-w-0">
                                  <p className="text-xs text-neutral-500 dark:text-neutral-400 flex-1 min-w-0">
                                    Used for agents:{" "}
                                    <span className="inline-flex items-center gap-1 min-w-0 align-middle w-full">
                                      <span
                                        ref={(el) => {
                                          usedListRefs.current[key.envVar] = el;
                                        }}
                                        className={`font-medium min-w-0 ${
                                          expandedUsedList[key.envVar]
                                            ? "flex-1 whitespace-normal break-words"
                                            : "flex-1 truncate"
                                        }`}
                                      >
                                        {usedModels.join(", ")}
                                      </span>
                                      {overflowUsedList[key.envVar] && (
                                        <a
                                          href="#"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            setExpandedUsedList((prev) => ({
                                              ...prev,
                                              [key.envVar]: !prev[key.envVar],
                                            }));
                                          }}
                                          className="flex-none text-[10px] text-blue-600 hover:underline dark:text-blue-400"
                                        >
                                          {expandedUsedList[key.envVar]
                                            ? "Hide more"
                                            : "Show more"}
                                        </a>
                                      )}
                                    </span>
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                          {providerInfo?.url && (
                            <a
                              href={providerInfo.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 whitespace-nowrap"
                            >
                              Get key
                              <svg
                                className="w-3 h-3"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                />
                              </svg>
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="md:w-[min(100%,480px)] md:flex-shrink-0 self-start">
                        {key.envVar === "CODEX_AUTH_JSON" ? (
                          <div className="relative">
                            {showKeys[key.envVar] ? (
                              <textarea
                                id={key.envVar}
                                value={apiKeyValues[key.envVar] || ""}
                                onChange={(e) =>
                                  handleApiKeyChange(key.envVar, e.target.value)
                                }
                                rows={4}
                                className="w-full px-3 py-2 pr-10 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 font-mono text-xs resize-y"
                                placeholder='{"tokens": {"id_token": "...", "access_token": "...", "refresh_token": "...", "account_id": "..."}, "last_refresh": "..."}'
                              />
                            ) : (
                              <div
                                onClick={() => toggleShowKey(key.envVar)}
                                className="w-full px-3 py-2 pr-10 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 font-mono text-xs cursor-pointer h-[82px]"
                              >
                                {apiKeyValues[key.envVar] ? (
                                  "••••••••••••••••••••••••••••••••"
                                ) : (
                                  <span className="text-neutral-400">
                                    Click to edit
                                  </span>
                                )}
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => toggleShowKey(key.envVar)}
                              className="absolute top-2 right-2 p-1 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                            >
                              {showKeys[key.envVar] ? (
                                <svg
                                  className="h-5 w-5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                                  />
                                </svg>
                              ) : (
                                <svg
                                  className="h-5 w-5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                  />
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                  />
                                </svg>
                              )}
                            </button>
                          </div>
                        ) : (
                          <div className="relative">
                            <input
                              type={showKeys[key.envVar] ? "text" : "password"}
                              id={key.envVar}
                              value={apiKeyValues[key.envVar] || ""}
                              onChange={(e) =>
                                handleApiKeyChange(key.envVar, e.target.value)
                              }
                              className="w-full px-3 py-2 pr-10 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 font-mono text-xs"
                              placeholder={
                                key.envVar === "CLAUDE_CODE_OAUTH_TOKEN"
                                  ? "sk-ant-oat01-..."
                                  : key.envVar === "ANTHROPIC_API_KEY"
                                    ? "sk-ant-api03-..."
                                    : key.envVar === "OPENAI_API_KEY"
                                      ? "sk-proj-..."
                                      : key.envVar === "OPENROUTER_API_KEY"
                                        ? "sk-or-v1-..."
                                        : `Enter your ${key.displayName}`
                              }
                            />
                            <button
                              type="button"
                              onClick={() => toggleShowKey(key.envVar)}
                              className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-500"
                            >
                              {showKeys[key.envVar] ? (
                                <svg
                                  className="h-5 w-5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                                  />
                                </svg>
                              ) : (
                                <svg
                                  className="h-5 w-5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                  />
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                  />
                                </svg>
                              )}
                            </button>
                          </div>
                        )}
                        {originalApiKeyValues[key.envVar] && (
                          <div className="flex items-center gap-1 mt-1">
                            <svg
                              className="w-3 h-3 text-green-500 dark:text-green-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                            <span className="text-xs text-green-600 dark:text-green-400">
                              API key configured
                            </span>
                          </div>
                        )}

                        {showBaseUrls && baseUrlKey && (
                          <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-2">
                            <label
                              htmlFor={baseUrlKey.envVar}
                              className="block text-xs font-medium text-neutral-700 dark:text-neutral-300"
                            >
                              {baseUrlKey.displayName}
                            </label>
                            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                              {baseUrlKey.description}
                              {baseUrlKey.envVar ===
                                ANTHROPIC_BASE_URL_KEY.envVar && (
                                <>
                                  {" "}
                                  Enter the base URL without the /v1 suffix.
                                  Example: https://my-proxy.example.com
                                </>
                              )}
                            </p>
                            <div className="flex flex-col sm:flex-row gap-2">
                              <input
                                id={baseUrlKey.envVar}
                                type="text"
                                value={baseUrlValue}
                                onChange={(e) =>
                                  handleBaseUrlChange(baseUrlKey, e.target.value)
                                }
                                className="flex-1 px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 font-mono text-xs"
                                placeholder={baseUrlKey.placeholder}
                                autoComplete="off"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  void testBaseUrlConnection(
                                    baseUrlKey,
                                    key.envVar
                                  )
                                }
                                disabled={
                                  !hasBaseUrlValue ||
                                  !apiKeyValues[key.envVar]?.trim() ||
                                  isTestingConnection[baseUrlKey.envVar]
                                }
                                className="px-3 py-2 text-xs rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isTestingConnection[baseUrlKey.envVar]
                                  ? "Testing..."
                                  : "Test Connection"}
                              </button>
                            </div>

                            {connectionResult && (
                              <div
                                className={`mt-1 rounded-lg px-2 py-1.5 text-[11px] ${
                                  connectionResult.status === "success"
                                    ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400"
                                    : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400"
                                }`}
                              >
                                <span className="font-medium">
                                  {connectionResult.status === "success"
                                    ? "Success: "
                                    : "Error: "}
                                </span>
                                {connectionResult.message}
                                {connectionResult.details?.endpoint && (
                                  <div className="mt-1 text-neutral-500 dark:text-neutral-400">
                                    Tested: {connectionResult.details.endpoint}
                                    {connectionResult.details.responseTime !==
                                      undefined && (
                                      <>
                                        {" "}
                                        ({connectionResult.details.responseTime}
                                        ms)
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {baseUrlKey.envVar ===
                              ANTHROPIC_BASE_URL_KEY.envVar &&
                              hasBaseUrlValue && (
                                <div className="mt-2 flex items-start justify-between gap-3 rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-2">
                                  <div>
                                    <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                                      Bypass cmux Anthropic proxy
                                    </p>
                                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                                      When enabled, Claude connects directly to
                                      your custom Anthropic endpoint.
                                    </p>
                                  </div>
                                  <Switch
                                    aria-label="Bypass cmux Anthropic proxy"
                                    size="sm"
                                    color="primary"
                                    isSelected={bypassAnthropicProxy}
                                    onValueChange={setBypassAnthropicProxy}
                                  />
                                </div>
                              )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </SettingSection>

      {/* Provider Status - hidden in web mode */}
      {!env.NEXT_PUBLIC_WEB_MODE && (
        <SettingSection title="Provider Status">
          <div className="p-4">
            <ProviderStatusSettings />
          </div>
        </SettingSection>
      )}
    </div>
  );
}
