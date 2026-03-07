import { AgentLogo } from "@/components/icons/agent-logos";
import { ScriptTextareaField } from "@/components/ScriptTextareaField";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AGENT_OPTIONS,
  buildJsonConfigText,
  DEFAULT_SCOPE_OPTIONS,
  MCP_INPUT_CLASS_NAME,
  MCP_MONO_TEXTAREA_CLASS_NAME,
  type AgentOption,
  type FormState,
  type Scope,
} from "@/lib/mcp-form-helpers";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2 } from "lucide-react";
import { useState } from "react";

export type UpdateFormField = <K extends keyof FormState>(
  field: K,
  value: FormState[K],
) => void;

export function SegmentedTabs<TValue extends string>({
  value,
  onChange,
  disabled = false,
  options,
}: {
  value: TValue;
  onChange: (value: TValue) => void;
  disabled?: boolean;
  options: Array<{ value: TValue; label: string }>;
}) {
  const containerClassName =
    "inline-flex items-center rounded-lg border border-neutral-200 bg-neutral-100 p-1 dark:border-neutral-800 dark:bg-neutral-950";
  const inactiveTabClassName =
    "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100";
  const activeTabClassName =
    "bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-100";

  return (
    <div className={containerClassName}>
      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active ? activeTabClassName : inactiveTabClassName
            } ${disabled ? "opacity-60" : ""}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function AgentToggleButton({
  agent,
  enabled,
  onToggle,
  disabled = false,
  pending = false,
  size = "sm",
}: {
  agent: AgentOption;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
  pending?: boolean;
  size?: "sm" | "md";
}) {
  const buttonSize = size === "md" ? "size-9 rounded-lg" : "size-8 rounded-lg";
  const logoSize = size === "md" ? "size-4.5" : "size-4";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={agent.label}
          aria-pressed={enabled}
          title={agent.label}
          onClick={onToggle}
          disabled={disabled}
          className={`inline-flex items-center justify-center border transition-all ${buttonSize} ${
            enabled
              ? "border-neutral-300 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
              : "border-transparent bg-transparent opacity-40 hover:opacity-75 dark:opacity-45"
          } ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin text-neutral-500 dark:text-neutral-300" />
          ) : (
            <AgentLogo agentName={`${agent.key}/ui`} className={logoSize} />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {agent.label}
        {enabled ? " enabled" : " disabled"}
      </TooltipContent>
    </Tooltip>
  );
}

export function McpCustomEditor({
  form,
  onFieldChange,
  jsonConfigText,
  onJsonConfigChange,
  onErrorChange,
  disableName = false,
  disableScope = false,
  scopeOptions = DEFAULT_SCOPE_OPTIONS,
  scopeDescription,
}: {
  form: FormState;
  onFieldChange: UpdateFormField;
  jsonConfigText: string;
  onJsonConfigChange: (value: string) => void;
  onErrorChange?: (message: string | null) => void;
  disableName?: boolean;
  disableScope?: boolean;
  scopeOptions?: Array<{ value: Scope; label: string }>;
  scopeDescription?: string;
}) {
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_380px]">
        <div className="space-y-5">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-base font-medium text-neutral-900 dark:text-neutral-100">
                  Full JSON Configuration
                </h2>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  Edit the MCP JSON directly, or open the config wizard when you want guided editing.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="w-fit px-0 text-sm text-blue-600 hover:bg-transparent hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                onClick={() => setWizardOpen(true)}
              >
                Config Wizard
              </Button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="space-y-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    Select MCP Type
                  </p>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    This flow currently supports stdio servers only.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
                    stdio
                  </div>
                  <div className="inline-flex items-center rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-500">
                    http
                  </div>
                  <div className="inline-flex items-center rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-500">
                    sse
                  </div>
                </div>
              </div>

              <ScriptTextareaField
                id="mcp-json-config"
                name="mcpJsonConfig"
                value={jsonConfigText}
                onChange={onJsonConfigChange}
                placeholder={'{\n  "type": "stdio",\n  "command": "npx",\n  "args": ["-y", "@my/mcp-server@latest"]\n}'}
                minRows={14}
                maxRows={24}
                autosize={false}
                description="Edit the raw MCP stdio configuration as JSON."
                subtitle="Currently supported keys: type, command, args, env."
                minHeightClassName="min-h-[320px] text-sm"
              />

              <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                <span>Only stdio JSON configs are supported in this pass.</span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  onClick={() => {
                    try {
                      const formatted = JSON.stringify(JSON.parse(jsonConfigText), null, 2);
                      onJsonConfigChange(formatted);
                      onErrorChange?.(null);
                    } catch (error) {
                      console.error(error);
                      onErrorChange?.("JSON configuration must be valid JSON.");
                    }
                  }}
                >
                  Format
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
            <div>
              <h2 className="text-base font-medium text-neutral-900 dark:text-neutral-100">
                MCP details
              </h2>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                Keep naming, agent enablement, and scope controls visible while editing configuration.
              </p>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="mcp-name-inline"
                  className="text-sm font-medium text-neutral-900 dark:text-neutral-100"
                >
                  MCP Title (Unique)
                </label>
                <input
                  id="mcp-name-inline"
                  value={form.name}
                  onChange={(event) => onFieldChange("name", event.target.value)}
                  disabled={disableName}
                  placeholder="my-mcp-server"
                  className={MCP_INPUT_CLASS_NAME}
                />
              </div>

              <div>
                <label
                  htmlFor="mcp-display-name-inline"
                  className="text-sm font-medium text-neutral-900 dark:text-neutral-100"
                >
                  Display Name
                </label>
                <input
                  id="mcp-display-name-inline"
                  value={form.displayName}
                  onChange={(event) =>
                    onFieldChange("displayName", event.target.value)
                  }
                  placeholder="@modelcontextprotocol/server-time"
                  className={MCP_INPUT_CLASS_NAME}
                />
              </div>

              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  Enable to Apps
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {AGENT_OPTIONS.map((agent) => (
                    <label
                      key={agent.key}
                      className="inline-flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300"
                    >
                      <input
                        id={`mcp-agent-${agent.key}`}
                        name={`mcp-agent-${agent.key}`}
                        type="checkbox"
                        checked={form[agent.field]}
                        onChange={() =>
                          onFieldChange(agent.field, !form[agent.field])
                        }
                        className="size-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500 dark:border-neutral-700"
                      />
                      {agent.label}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  Scope
                </p>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  {scopeDescription ??
                    "Choose whether this server is shared globally or attached to one workspace."}
                </p>
                <div className="mt-3">
                  <SegmentedTabs
                    value={form.scope}
                    onChange={(scope) => onFieldChange("scope", scope)}
                    disabled={disableScope}
                    options={scopeOptions}
                  />
                </div>
                {form.scope === "workspace" ? (
                  <div className="mt-4">
                    <label
                      htmlFor="mcp-project-full-name-inline"
                      className="text-sm font-medium text-neutral-900 dark:text-neutral-100"
                    >
                      Workspace repository
                    </label>
                    <input
                      id="mcp-project-full-name-inline"
                      value={form.projectFullName}
                      onChange={(event) =>
                        onFieldChange("projectFullName", event.target.value)
                      }
                      disabled={disableScope}
                      placeholder="owner/repo"
                      className={MCP_INPUT_CLASS_NAME}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog.Root open={wizardOpen} onOpenChange={setWizardOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[var(--z-global-blocking)] bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[var(--z-global-blocking)] w-[min(720px,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
            <Dialog.Title className="text-xl font-medium text-neutral-900 dark:text-neutral-100">
              MCP Configuration Wizard
            </Dialog.Title>
            <Dialog.Description className="mt-1 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
              Quickly configure MCP server and auto-generate JSON configuration.
            </Dialog.Description>

            <div className="mt-6 space-y-5">
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  Type
                </p>
                <div className="mt-3 flex items-center gap-4 text-sm text-neutral-700 dark:text-neutral-300">
                  <label className="inline-flex items-center gap-2">
                    <input name="wizardTransportType" type="radio" checked readOnly className="size-4" />
                    stdio
                  </label>
                  <label className="inline-flex items-center gap-2 opacity-50">
                    <input name="wizardTransportType" type="radio" disabled className="size-4" />
                    http
                  </label>
                  <label className="inline-flex items-center gap-2 opacity-50">
                    <input name="wizardTransportType" type="radio" disabled className="size-4" />
                    sse
                  </label>
                </div>
              </div>

              <div>
                <label
                  htmlFor="wizard-mcp-name"
                  className="text-sm font-medium text-neutral-900 dark:text-neutral-100"
                >
                  MCP Title (Unique)
                </label>
                <input
                  id="wizard-mcp-name"
                  value={form.name}
                  onChange={(event) => onFieldChange("name", event.target.value)}
                  disabled={disableName}
                  placeholder="my-mcp-server"
                  className={MCP_INPUT_CLASS_NAME}
                />
              </div>

              <div>
                <label
                  htmlFor="wizard-command"
                  className="text-sm font-medium text-neutral-900 dark:text-neutral-100"
                >
                  Command
                </label>
                <input
                  id="wizard-command"
                  value={form.command}
                  onChange={(event) => onFieldChange("command", event.target.value)}
                  placeholder="npx or uvx"
                  className={MCP_INPUT_CLASS_NAME}
                />
              </div>

              <div>
                <label
                  htmlFor="wizard-args"
                  className="text-sm font-medium text-neutral-900 dark:text-neutral-100"
                >
                  Arguments
                </label>
                <textarea
                  id="wizard-args"
                  rows={5}
                  value={form.argsText}
                  onChange={(event) => onFieldChange("argsText", event.target.value)}
                  placeholder={"arg1\narg2"}
                  className={MCP_MONO_TEXTAREA_CLASS_NAME}
                />
              </div>

              <div>
                <label
                  htmlFor="wizard-env-vars"
                  className="text-sm font-medium text-neutral-900 dark:text-neutral-100"
                >
                  Environment Variables
                </label>
                <textarea
                  id="wizard-env-vars"
                  rows={5}
                  value={form.envVarsText}
                  onChange={(event) => onFieldChange("envVarsText", event.target.value)}
                  placeholder={"KEY1=value1\nKEY2=value2"}
                  className={MCP_MONO_TEXTAREA_CLASS_NAME}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-neutral-200 pt-5 dark:border-neutral-800">
              <Button variant="outline" onClick={() => setWizardOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  onJsonConfigChange(buildJsonConfigText(form));
                  onErrorChange?.(null);
                  setWizardOpen(false);
                }}
              >
                Apply Configuration
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
