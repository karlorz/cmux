import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { AGENT_CONFIGS } from "@cmux/shared/agentConfig";
import { useState, useCallback } from "react";

interface AgentConfigStepProps {
  onNext: () => void;
  onSkip: () => void;
}

const DEFAULT_AGENTS = [
  "claude/sonnet-4.5",
  "claude/opus-4.1",
  "codex/gpt-5-codex-high",
];

export function AgentConfigStep({ onNext, onSkip }: AgentConfigStepProps) {
  const [selectedAgents, setSelectedAgents] = useState<string[]>(
    DEFAULT_AGENTS.filter((agent) =>
      AGENT_CONFIGS.some((config) => config.name === agent)
    )
  );

  const handleToggleAgent = useCallback(
    (agentName: string) => {
      if (selectedAgents.includes(agentName)) {
        setSelectedAgents(selectedAgents.filter((a) => a !== agentName));
      } else {
        setSelectedAgents([...selectedAgents, agentName]);
      }
    },
    [selectedAgents]
  );

  const handleContinue = useCallback(() => {
    // Save selected agents to localStorage
    if (selectedAgents.length > 0) {
      localStorage.setItem("selectedAgents", JSON.stringify(selectedAgents));
    }
    onNext();
  }, [selectedAgents, onNext]);

  return (
    <div className="flex flex-col">
      <div className="mb-4">
        <h2 className="mb-1 text-xl font-semibold text-neutral-900 dark:text-neutral-50">
          Configure Agents
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Select which AI agents to use. You can change this later.
        </p>
      </div>

      <div className="mb-4 space-y-2">
        {AGENT_CONFIGS.map((agent) => (
          <button
            key={agent.name}
            onClick={() => handleToggleAgent(agent.name)}
            className={`w-full rounded-lg border px-4 py-3 text-left transition-all ${
              selectedAgents.includes(agent.name)
                ? "border-primary bg-primary/5 dark:bg-primary/10"
                : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="font-medium text-neutral-900 dark:text-neutral-100">
                  {agent.name}
                </div>
              </div>
              <div
                className={`mt-1 h-4 w-4 rounded border-2 flex items-center justify-center ${
                  selectedAgents.includes(agent.name)
                    ? "border-primary bg-primary"
                    : "border-neutral-300 dark:border-neutral-600"
                }`}
              >
                {selectedAgents.includes(agent.name) && (
                  <svg
                    className="h-3 w-3 text-white"
                    viewBox="0 0 12 12"
                    fill="none"
                  >
                    <path
                      d="M10 3L4.5 8.5L2 6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" onClick={onSkip} size="sm">
          Skip
        </Button>
        <Button
          onClick={handleContinue}
          disabled={selectedAgents.length === 0}
          size="sm"
          className="gap-1.5"
        >
          Continue
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
