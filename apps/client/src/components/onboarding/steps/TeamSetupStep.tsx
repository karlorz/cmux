import { useState } from "react";
import { motion } from "framer-motion";
import {
  Users,
  UserPlus,
  Building2,
  ArrowRight,
  Info,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@stackframe/react";

interface TeamSetupStepProps {
  teamSlugOrId?: string;
}

export function TeamSetupStep(_props: TeamSetupStepProps) {
  const user = useUser({ or: "return-null" });
  const teams = user?.useTeams() ?? [];
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);

  const hasTeam = teams.length > 0;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-green-500/20 to-blue-500/20 flex items-center justify-center"
        >
          <Users className="h-10 w-10 text-green-600 dark:text-green-400" />
        </motion.div>

        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            {hasTeam ? "Your Team is Ready" : "Let's Set Up Your Team"}
          </h3>
          <p className="text-neutral-600 dark:text-neutral-400 max-w-md mx-auto">
            {hasTeam
              ? `You're part of ${teams.length} team${teams.length > 1 ? 's' : ''}. Teams help organize repositories and collaborate with others.`
              : "Teams are the foundation of cmux. They help organize repositories and enable collaboration."}
          </p>
        </div>
      </div>

      {hasTeam ? (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
              <div>
                <p className="font-medium text-green-900 dark:text-green-100">
                  You're all set with teams!
                </p>
                <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                  You can create additional teams or invite members anytime from the dashboard.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Your teams:
            </p>
            {teams.slice(0, 3).map((team) => (
              <motion.div
                key={team.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">
                    {team.displayName}
                  </p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Team ID: {team.id.slice(0, 8)}...
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4">
            <div className="p-6 rounded-lg border-2 border-dashed border-neutral-300 dark:border-neutral-700 text-center">
              <UserPlus className="h-8 w-8 text-neutral-400 dark:text-neutral-500 mx-auto mb-3" />
              <p className="font-medium text-neutral-900 dark:text-neutral-100 mb-2">
                No teams yet
              </p>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                Create your first team to start organizing repositories
              </p>
              <Button
                onClick={() => setIsCreatingTeam(true)}
                className="gap-2"
                disabled={isCreatingTeam}
              >
                {isCreatingTeam ? (
                  <>Creating team...</>
                ) : (
                  <>
                    Create Your First Team
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-blue-900 dark:text-blue-100">
                  Why teams matter:
                </p>
                <ul className="mt-2 space-y-1 text-blue-800 dark:text-blue-200">
                  <li>• Organize repositories by project or client</li>
                  <li>• Control access and permissions</li>
                  <li>• Share environments and configurations</li>
                  <li>• Collaborate on tasks and reviews</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}