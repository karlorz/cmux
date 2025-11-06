import { motion } from "framer-motion";
import {
  Layers3,
  Container,
  Terminal,
  Code2,
  Shield,
  Database,
  Info,
} from "lucide-react";

export function EnvironmentIntroStep() {
  const concepts = [
    {
      icon: <Container className="h-5 w-5" />,
      title: "Isolated Containers",
      description: "Each task runs in its own Docker container with dedicated resources",
    },
    {
      icon: <Terminal className="h-5 w-5" />,
      title: "VS Code Integration",
      description: "Every environment includes a full VS Code instance with extensions",
    },
    {
      icon: <Shield className="h-5 w-5" />,
      title: "Secure Sandboxing",
      description: "Tasks are isolated from each other and your local system",
    },
    {
      icon: <Database className="h-5 w-5" />,
      title: "Persistent State",
      description: "Environments can be saved and resumed for long-running tasks",
    },
  ];

  const workflow = [
    {
      step: 1,
      title: "Task Creation",
      description: "Define your task and select agents",
    },
    {
      step: 2,
      title: "Environment Spawn",
      description: "cmux creates an isolated container",
    },
    {
      step: 3,
      title: "Agent Execution",
      description: "Agents work in parallel with full IDE access",
    },
    {
      step: 4,
      title: "Review & Ship",
      description: "Review changes and create pull requests",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center"
        >
          <Layers3 className="h-10 w-10 text-cyan-600 dark:text-cyan-400" />
        </motion.div>

        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            Understanding Environments
          </h3>
          <p className="text-neutral-600 dark:text-neutral-400 max-w-md mx-auto">
            Learn how cmux creates isolated, powerful environments for your AI agents to work in.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Key Concepts */}
        <div>
          <h4 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">
            Key Concepts
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {concepts.map((concept, index) => (
              <motion.div
                key={concept.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
                    {concept.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-neutral-900 dark:text-neutral-100">
                      {concept.title}
                    </p>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                      {concept.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Workflow */}
        <div>
          <h4 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">
            How It Works
          </h4>
          <div className="relative">
            {/* Connection line */}
            <div className="absolute left-5 top-8 bottom-8 w-0.5 bg-gradient-to-b from-cyan-500 to-blue-500 opacity-20" />

            <div className="space-y-4">
              {workflow.map((item, index) => (
                <motion.div
                  key={item.step}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.15 }}
                  className="flex items-start gap-4"
                >
                  <div className="relative flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-white font-semibold">
                    {item.step}
                  </div>
                  <div className="flex-1 pt-1">
                    <p className="font-medium text-neutral-900 dark:text-neutral-100">
                      {item.title}
                    </p>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      {item.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Configuration Preview */}
        <div className="p-4 rounded-lg bg-neutral-900 dark:bg-neutral-950 border border-neutral-800">
          <div className="flex items-center gap-2 mb-3">
            <Code2 className="h-4 w-4 text-green-500" />
            <span className="text-xs font-mono text-green-500">devcontainer.json</span>
          </div>
          <pre className="text-xs text-neutral-400 font-mono overflow-x-auto">
{`{
  "image": "cmux/agent-environment:latest",
  "features": {
    "node": "20",
    "python": "3.11",
    "docker-in-docker": true
  },
  "customizations": {
    "vscode": {
      "extensions": [
        "github.copilot",
        "ms-python.python"
      ]
    }
  }
}`}
          </pre>
        </div>

        {/* Info Box */}
        <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-900 dark:text-blue-100">
                Environment Benefits:
              </p>
              <ul className="mt-2 space-y-1 text-blue-800 dark:text-blue-200">
                <li>• No local setup required - everything runs in the cloud</li>
                <li>• Consistent environments across your team</li>
                <li>• Automatic dependency installation</li>
                <li>• Built-in debugging and monitoring tools</li>
                <li>• Snapshots for reproducible results</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}