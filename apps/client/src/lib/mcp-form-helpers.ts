import type { Doc } from "@cmux/convex/dataModel";
import {
  parseGithubRepoUrl,
  type McpServerPreset,
} from "@cmux/shared";

export type Scope = "global" | "workspace";
export type AgentKey = "claude" | "codex" | "gemini" | "opencode";
export type McpServerConfig = Doc<"mcpServerConfigs">;

export type FormState = {
  name: string;
  displayName: string;
  command: string;
  argsText: string;
  envVarsText: string;
  description: string;
  enabledClaude: boolean;
  enabledCodex: boolean;
  enabledGemini: boolean;
  enabledOpencode: boolean;
  scope: Scope;
  projectFullName: string;
};

export type AgentField = keyof Pick<
  McpServerConfig,
  "enabledClaude" | "enabledCodex" | "enabledGemini" | "enabledOpencode"
>;

export type AgentOption = {
  key: AgentKey;
  label: string;
  field: AgentField;
};

export const VALID_MCP_NAME_REGEX = /^[A-Za-z0-9_-]+$/;
export const EXISTING_SECRET_PLACEHOLDER = "<existing-secret>";
export const MCP_INPUT_CLASS_NAME =
  "mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";
export const MCP_TEXTAREA_CLASS_NAME =
  "mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";
export const MCP_MONO_TEXTAREA_CLASS_NAME = `${MCP_TEXTAREA_CLASS_NAME} font-mono`;

export const AGENT_OPTIONS: AgentOption[] = [
  { key: "claude", label: "Claude", field: "enabledClaude" },
  { key: "codex", label: "Codex", field: "enabledCodex" },
  { key: "gemini", label: "Gemini", field: "enabledGemini" },
  { key: "opencode", label: "OpenCode", field: "enabledOpencode" },
];

export const EMPTY_AGENT_COUNTS: Record<AgentKey, number> = {
  claude: 0,
  codex: 0,
  gemini: 0,
  opencode: 0,
};

export function shouldRebuildJsonConfig(field: keyof FormState): boolean {
  return field === "command" || field === "argsText" || field === "envVarsText";
}

export function getScopeOptions(counts?: Record<Scope, number>) {
  return [
    {
      value: "global",
      label: counts ? `Global (${counts.global})` : "Global",
    },
    {
      value: "workspace",
      label: counts ? `Workspace (${counts.workspace})` : "Workspace",
    },
  ] satisfies Array<{ value: Scope; label: string }>;
}

export const DEFAULT_SCOPE_OPTIONS = getScopeOptions();

export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function buildEmptyForm(scope: Scope): FormState {
  return {
    name: "",
    displayName: "",
    command: "",
    argsText: "",
    envVarsText: "",
    description: "",
    enabledClaude: true,
    enabledCodex: true,
    enabledGemini: true,
    enabledOpencode: true,
    scope,
    projectFullName: "",
  };
}

export function buildFormFromConfig(config: McpServerConfig): FormState {
  const envVarsText = config.envVars
    ? Object.keys(config.envVars)
        .map((key) => `${key}=${EXISTING_SECRET_PLACEHOLDER}`)
        .join("\n")
    : "";

  return {
    name: config.name,
    displayName: config.displayName,
    command: config.command,
    argsText: config.args.join("\n"),
    envVarsText,
    description: config.description ?? "",
    enabledClaude: config.enabledClaude,
    enabledCodex: config.enabledCodex,
    enabledGemini: config.enabledGemini,
    enabledOpencode: config.enabledOpencode,
    scope: config.scope,
    projectFullName: config.projectFullName ?? "",
  };
}

export function parseArgsText(value: string): string[] {
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export type McpJsonConfig = {
  type: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

export function buildJsonConfigText(input: Pick<FormState, "command" | "argsText" | "envVarsText">): string {
  const config: McpJsonConfig = {
    type: "stdio",
    command: input.command.trim(),
  };

  const args = parseArgsText(input.argsText);
  if (args.length > 0) {
    config.args = args;
  }

  const parsedEnvVars = parseEnvVarsText(input.envVarsText);
  if (parsedEnvVars.hasChanges && parsedEnvVars.envVars) {
    config.env = parsedEnvVars.envVars;
  }

  return JSON.stringify(config, null, 2);
}

export function parseJsonConfigText(value: string): {
  command: string;
  argsText: string;
  envVarsText: string;
  error?: string;
} {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        command: "",
        argsText: "",
        envVarsText: "",
        error: "JSON configuration must be an object.",
      };
    }

    const config = parsed as Record<string, unknown>;
    const type = config.type;
    if (type !== undefined && type !== "stdio") {
      return {
        command: "",
        argsText: "",
        envVarsText: "",
        error: "Only stdio MCP JSON configuration is currently supported.",
      };
    }

    if (typeof config.command !== "string" || config.command.trim().length === 0) {
      return {
        command: "",
        argsText: "",
        envVarsText: "",
        error: "JSON configuration requires a non-empty command string.",
      };
    }

    let argsText = "";
    if (config.args !== undefined) {
      if (!Array.isArray(config.args) || config.args.some((entry) => typeof entry !== "string")) {
        return {
          command: "",
          argsText: "",
          envVarsText: "",
          error: "JSON configuration args must be an array of strings.",
        };
      }
      argsText = config.args.join("\n");
    }

    let envVarsText = "";
    if (config.env !== undefined) {
      if (
        typeof config.env !== "object" ||
        config.env === null ||
        Array.isArray(config.env) ||
        Object.values(config.env).some((entry) => typeof entry !== "string")
      ) {
        return {
          command: "",
          argsText: "",
          envVarsText: "",
          error: "JSON configuration env must be an object of string values.",
        };
      }
      envVarsText = Object.entries(config.env)
        .map(([key, entry]) => `${key}=${entry}`)
        .join("\n");
    }

    return {
      command: config.command,
      argsText,
      envVarsText,
    };
  } catch (error) {
    console.error(error);
    return {
      command: "",
      argsText: "",
      envVarsText: "",
      error: "JSON configuration must be valid JSON.",
    };
  }
}

export function parseEnvVarsText(value: string): {
  envVars?: Record<string, string>;
  hasChanges: boolean;
  error?: string;
} {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { hasChanges: false };
  }

  const entries: Array<[string, string]> = [];
  let hasChanges = false;

  for (const line of lines) {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      return {
        hasChanges: false,
        error: "Environment variables must use KEY=value format, one per line.",
      };
    }

    const key = line.slice(0, separatorIndex).trim();
    const envValue = line.slice(separatorIndex + 1);
    if (!key) {
      return {
        hasChanges: false,
        error: "Environment variables must include a key before '='.",
      };
    }

    if (envValue === EXISTING_SECRET_PLACEHOLDER) {
      continue;
    }

    hasChanges = true;
    entries.push([key, envValue]);
  }

  if (!hasChanges || entries.length === 0) {
    return { hasChanges: false };
  }

  return { envVars: Object.fromEntries(entries), hasChanges: true };
}

export function isValidProjectFullName(value: string): boolean {
  return parseGithubRepoUrl(value)?.fullName === value.trim();
}

export function getScopedProjectFullName(
  scope: Scope,
  projectFullName: string,
): string | undefined {
  return scope === "workspace" ? projectFullName.trim() : undefined;
}

export function buildEnabledAgentState(
  config: Pick<McpServerConfig, AgentField>,
  field: AgentField,
  nextValue: boolean,
): Pick<McpServerConfig, AgentField> {
  const nextState = {
    enabledClaude: config.enabledClaude,
    enabledCodex: config.enabledCodex,
    enabledGemini: config.enabledGemini,
    enabledOpencode: config.enabledOpencode,
  };

  nextState[field] = nextValue;
  return nextState;
}

export function countEnabledAgents(
  configs: Array<Pick<McpServerConfig, AgentField>>,
): Record<AgentKey, number> {
  const nextCounts = { ...EMPTY_AGENT_COUNTS };

  for (const config of configs) {
    for (const agent of AGENT_OPTIONS) {
      if (config[agent.field]) {
        nextCounts[agent.key] += 1;
      }
    }
  }

  return nextCounts;
}

export function matchesTarget(
  config: McpServerConfig,
  scope: Scope,
  projectFullName: string,
): boolean {
  if (config.scope !== scope) {
    return false;
  }

  if (scope === "global") {
    return true;
  }

  return (config.projectFullName ?? "") === projectFullName.trim();
}

export function validateForm(form: FormState): string | null {
  if (!form.name.trim()) {
    return "Name is required.";
  }
  if (!VALID_MCP_NAME_REGEX.test(form.name.trim())) {
    return "Name can only contain letters, numbers, hyphens, and underscores.";
  }
  if (!form.displayName.trim()) {
    return "Display name is required.";
  }
  if (!form.command.trim()) {
    return "Command is required.";
  }
  if (!AGENT_OPTIONS.some((agent) => form[agent.field])) {
    return "Enable at least one agent.";
  }
  if (
    form.scope === "workspace" &&
    !isValidProjectFullName(form.projectFullName)
  ) {
    return "Workspace scope requires a repository in owner/repo format.";
  }

  const parsedEnvVars = parseEnvVarsText(form.envVarsText);
  if (parsedEnvVars.error) {
    return parsedEnvVars.error;
  }

  return null;
}

export function getPresetPayload(
  preset: McpServerPreset,
  scope: Scope,
  projectFullName: string,
) {
  if (scope === "workspace" && !isValidProjectFullName(projectFullName)) {
    throw new Error("Workspace scope requires a repository in owner/repo format.");
  }

  return {
    name: preset.name,
    displayName: preset.displayName,
    command: preset.command,
    args: preset.args,
    description: preset.description,
    tags: preset.tags,
    enabledClaude: preset.supportedAgents.claude,
    enabledCodex: preset.supportedAgents.codex,
    enabledGemini: preset.supportedAgents.gemini,
    enabledOpencode: preset.supportedAgents.opencode,
    scope,
    projectFullName: scope === "workspace" ? projectFullName.trim() : undefined,
  };
}
