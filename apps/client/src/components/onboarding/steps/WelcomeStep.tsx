import { motion } from "framer-motion";
import {
  Zap,
  Users,
  GitBranch,
  Layers3,
  Rocket,
  CheckCircle2,
} from "lucide-react";

export function WelcomeStep() {
  const features = [
    {
      icon: <Zap className="h-5 w-5" />,
      title: "Multi-Agent Orchestration",
      description: "Run Claude Code, Codex, Gemini, and more in parallel across tasks",
    },
    {
      icon: <GitBranch className="h-5 w-5" />,
      title: "GitHub Integration",
      description: "Connect repositories and manage pull requests seamlessly",
    },
    {
      icon: <Layers3 className="h-5 w-5" />,
      title: "Isolated Environments",
      description: "Each task runs in its own Docker container with VS Code",
    },
    {
      icon: <Users className="h-5 w-5" />,
      title: "Team Collaboration",
      description: "Share tasks, review code, and collaborate with your team",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="mx-auto w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center"
        >
          <Rocket className="h-12 w-12 text-white" />
        </motion.div>

        <div className="space-y-2">
          <h3 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            Welcome to cmux
          </h3>
          <p className="text-neutral-600 dark:text-neutral-400 max-w-lg mx-auto">
            The command center for AI coding agents. Let's get you set up in just a few steps.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-8">
        {features.map((feature, index) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
            className="relative p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50"
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                {feature.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-neutral-900 dark:text-neutral-100">
                  {feature.title}
                </h4>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                  {feature.description}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-8 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-blue-900 dark:text-blue-100">
              This quick tour will help you:
            </p>
            <ul className="mt-2 space-y-1 text-blue-800 dark:text-blue-200">
              <li>• Create or join a team</li>
              <li>• Connect your GitHub account</li>
              <li>• Select repositories to work with</li>
              <li>• Understand environments and workflows</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}