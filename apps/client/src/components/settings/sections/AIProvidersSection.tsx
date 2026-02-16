import type { MutableRefObject } from "react";
import {
  ANTHROPIC_BASE_URL_KEY,
  API_KEY_TO_BASE_URL,
  type ProviderBaseUrlKey,
} from "@cmux/shared";
import { Switch } from "@heroui/react";
import { Check, ChevronDown, ExternalLink, Eye, EyeOff } from "lucide-react";
import { ProviderStatusSettings } from "@/components/provider-status-settings";
import { SettingSection } from "@/components/settings/SettingSection";

interface ApiKeyConfig {
  envVar: string;
  displayName: string;
  description?: string;
}

export interface ProviderInfo {
  url?: string;
  helpText?: string;
}

export type ConnectionTestResult = {
  status: "success" | "error";
  message: string;
  details?: {
    statusCode?: number;
    responseTime?: number;
    endpoint: string;
    modelsFound?: number;
  };
};

interface AIProvidersSectionProps {
  apiKeys: ApiKeyConfig[];
  providerInfo: Record<string, ProviderInfo>;
  apiKeyModelsByEnv: Record<string, string[]>;
  apiKeyValues: Record<string, string>;
  originalApiKeyValues: Record<string, string>;
  showKeys: Record<string, boolean>;
  onApiKeyChange: (envVar: string, value: string) => void;
  onToggleShowKey: (envVar: string) => void;
  showBaseUrls: boolean;
  onToggleShowBaseUrls: () => void;
  baseUrlValues: Record<string, string>;
  onBaseUrlChange: (baseUrlKey: ProviderBaseUrlKey, value: string) => void;
  onTestBaseUrlConnection: (
    baseUrlKey: ProviderBaseUrlKey,
    apiKeyEnvVar: string
  ) => void;
  isTestingConnection: Record<string, boolean>;
  connectionTestResults: Record<string, ConnectionTestResult | null>;
  usedListRefs: MutableRefObject<Record<string, HTMLSpanElement | null>>;
  expandedUsedList: Record<string, boolean>;
  overflowUsedList: Record<string, boolean>;
  onToggleUsedList: (envVar: string) => void;
  bypassAnthropicProxy: boolean;
  onBypassAnthropicProxyChange: (value: boolean) => void;
  showProviderStatus: boolean;
}

export function AIProvidersSection({
  apiKeys,
  providerInfo,
  apiKeyModelsByEnv,
  apiKeyValues,
  originalApiKeyValues,
  showKeys,
  onApiKeyChange,
  onToggleShowKey,
  showBaseUrls,
  onToggleShowBaseUrls,
  baseUrlValues,
  onBaseUrlChange,
  onTestBaseUrlConnection,
  isTestingConnection,
  connectionTestResults,
  usedListRefs,
  expandedUsedList,
  overflowUsedList,
  onToggleUsedList,
  bypassAnthropicProxy,
  onBypassAnthropicProxyChange,
  showProviderStatus,
}: AIProvidersSectionProps) {
  return (
    <div className="space-y-4">
      <SettingSection title="AI Provider Authentication">
        <div className="p-4 space-y-3">
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
                    onClick={onToggleShowBaseUrls}
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
                      Start a coding CLI and complete its sign-in flow; cmux
                      reuses that authentication.
                    </li>
                    <li>
                      Or enter API keys here and cmux will use them directly.
                    </li>
                  </ul>
                </div>
              </div>

              {apiKeys.map((key) => {
                const info = providerInfo[key.envVar];
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
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <label
                          htmlFor={key.envVar}
                          className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
                        >
                          {key.displayName}
                        </label>
                        {info?.helpText ? (
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                            {info.helpText}
                          </p>
                        ) : null}

                        {usedModels.length > 0 ? (
                          <div className="mt-1">
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
                                {overflowUsedList[key.envVar] ? (
                                  <button
                                    type="button"
                                    onClick={() => onToggleUsedList(key.envVar)}
                                    className="flex-none text-[10px] text-blue-600 hover:underline dark:text-blue-400"
                                  >
                                    {expandedUsedList[key.envVar]
                                      ? "Hide more"
                                      : "Show more"}
                                  </button>
                                ) : null}
                              </span>
                            </p>
                          </div>
                        ) : null}
                      </div>

                      {info?.url ? (
                        <a
                          href={info.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 whitespace-nowrap"
                        >
                          Get key
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : null}
                    </div>

                    <div className="md:w-[min(100%,480px)] md:flex-shrink-0 self-start">
                      {key.envVar === "CODEX_AUTH_JSON" ? (
                        <div className="relative">
                          {showKeys[key.envVar] ? (
                            <textarea
                              id={key.envVar}
                              value={apiKeyValues[key.envVar] || ""}
                              onChange={(e) =>
                                onApiKeyChange(key.envVar, e.target.value)
                              }
                              rows={4}
                              className="w-full px-3 py-2 pr-10 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 font-mono text-xs resize-y"
                              placeholder='{"tokens": {"id_token": "...", "access_token": "..."}}'
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => onToggleShowKey(key.envVar)}
                              className="w-full text-left px-3 py-2 pr-10 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 font-mono text-xs h-[82px]"
                            >
                              {apiKeyValues[key.envVar] ? (
                                "••••••••••••••••••••••••••••••••"
                              ) : (
                                <span className="text-neutral-400">Click to edit</span>
                              )}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onToggleShowKey(key.envVar)}
                            className="absolute top-2 right-2 p-1 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                          >
                            {showKeys[key.envVar] ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
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
                              onApiKeyChange(key.envVar, e.target.value)
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
                            onClick={() => onToggleShowKey(key.envVar)}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-500"
                          >
                            {showKeys[key.envVar] ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      )}

                      {originalApiKeyValues[key.envVar] ? (
                        <div className="flex items-center gap-1 mt-1">
                          <Check className="w-3 h-3 text-green-500 dark:text-green-400" />
                          <span className="text-xs text-green-600 dark:text-green-400">
                            API key configured
                          </span>
                        </div>
                      ) : null}

                      {showBaseUrls && baseUrlKey ? (
                        <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-2">
                          <label
                            htmlFor={baseUrlKey.envVar}
                            className="block text-xs font-medium text-neutral-700 dark:text-neutral-300"
                          >
                            {baseUrlKey.displayName}
                          </label>
                          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                            {baseUrlKey.description}
                            {baseUrlKey.envVar === ANTHROPIC_BASE_URL_KEY.envVar
                              ? " Enter the base URL without the /v1 suffix. Example: https://my-proxy.example.com"
                              : ""}
                          </p>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              id={baseUrlKey.envVar}
                              type="text"
                              value={baseUrlValue}
                              onChange={(e) =>
                                onBaseUrlChange(baseUrlKey, e.target.value)
                              }
                              className="flex-1 px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 font-mono text-xs"
                              placeholder={baseUrlKey.placeholder}
                              autoComplete="off"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                onTestBaseUrlConnection(baseUrlKey, key.envVar)
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

                          {connectionResult ? (
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
                              {connectionResult.details?.endpoint ? (
                                <div className="mt-1 text-neutral-500 dark:text-neutral-400">
                                  Tested: {connectionResult.details.endpoint}
                                  {connectionResult.details.responseTime !==
                                  undefined
                                    ? ` (${connectionResult.details.responseTime}ms)`
                                    : ""}
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          {baseUrlKey.envVar === ANTHROPIC_BASE_URL_KEY.envVar &&
                          hasBaseUrlValue ? (
                            <div className="mt-2 flex items-start justify-between gap-3 rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-2">
                              <div>
                                <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                                  Bypass cmux Anthropic proxy
                                </p>
                                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                                  When enabled, Claude connects directly to your
                                  custom Anthropic endpoint.
                                </p>
                              </div>
                              <Switch
                                aria-label="Bypass cmux Anthropic proxy"
                                size="sm"
                                color="primary"
                                isSelected={bypassAnthropicProxy}
                                onValueChange={onBypassAnthropicProxyChange}
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </SettingSection>

      {showProviderStatus ? (
        <SettingSection title="Provider Status">
          <div className="p-4">
            <ProviderStatusSettings />
          </div>
        </SettingSection>
      ) : null}
    </div>
  );
}
