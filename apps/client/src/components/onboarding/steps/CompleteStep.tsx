import { motion } from "framer-motion";
import {
  CheckCircle2,
  ArrowRight,
  BookOpen,
  MessageSquare,
  Zap,
  Trophy,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { completeOnboardingStep, OnboardingStep } from "@/lib/onboarding";
import { useEffect } from "react";

interface CompleteStepProps {
  onGetStarted: () => void;
}

export function CompleteStep({ onGetStarted }: CompleteStepProps) {
  useEffect(() => {
    // Mark onboarding as complete
    completeOnboardingStep(OnboardingStep.FirstTask);
  }, []);

  const nextSteps = [
    {
      icon: <Zap className="h-5 w-5" />,
      title: "Create your first task",
      description: "Start with a simple bug fix or feature",
    },
    {
      icon: <BookOpen className="h-5 w-5" />,
      title: "Explore documentation",
      description: "Learn advanced features and best practices",
    },
    {
      icon: <MessageSquare className="h-5 w-5" />,
      title: "Join the community",
      description: "Connect with other developers using cmux",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, type: "spring" }}
          className="mx-auto w-24 h-24 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, duration: 0.3 }}
          >
            <Trophy className="h-12 w-12 text-white" />
          </motion.div>
        </motion.div>

        <div className="space-y-2">
          <motion.h3
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100"
          >
            Congratulations! You're all set
          </motion.h3>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-neutral-600 dark:text-neutral-400 max-w-md mx-auto"
          >
            You've successfully set up cmux. Now you're ready to supercharge your development with AI agents.
          </motion.p>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="p-4 rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border border-green-200 dark:border-green-900"
      >
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400 flex-shrink-0" />
          <div>
            <p className="font-medium text-green-900 dark:text-green-100">
              Setup Complete
            </p>
            <p className="text-sm text-green-700 dark:text-green-300 mt-1">
              Your team, GitHub connection, and repositories are all configured.
            </p>
          </div>
        </div>
      </motion.div>

      <div className="space-y-4">
        <h4 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          What's next?
        </h4>
        <div className="grid gap-3">
          {nextSteps.map((step, index) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 + index * 0.1 }}
              className="flex items-start gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                {step.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-neutral-900 dark:text-neutral-100">
                  {step.title}
                </p>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  {step.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9 }}
        className="flex flex-col items-center gap-4 pt-4"
      >
        <Button
          onClick={onGetStarted}
          size="lg"
          className="gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
        >
          <Sparkles className="h-4 w-4" />
          Go to Dashboard
          <ArrowRight className="h-4 w-4" />
        </Button>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          You can always access help from the menu
        </p>
      </motion.div>
    </div>
  );
}