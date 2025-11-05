import { CheckCircle2, Rocket, ArrowRight, BookOpen, MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";

interface QuickStartStepProps {
  selectedRepos: string[];
}

export function QuickStartStep({ selectedRepos }: QuickStartStepProps) {
  return (
    <div className="space-y-8 py-4">
      {/* Success header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-green-500/20 to-green-500/5 border border-green-500/20 mb-2">
          <CheckCircle2 className="w-10 h-10 text-green-500" />
        </div>
        <h2 className="text-3xl font-bold">You're All Set!</h2>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto">
          Your cmux workspace is ready. Here's what you can do next:
        </p>
      </div>

      {/* Summary */}
      <Card className="p-6 bg-muted/30 border-2">
        <div className="space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            Setup Complete
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">GitHub Connected</p>
              <p className="font-medium">Yes</p>
            </div>
            <div>
              <p className="text-muted-foreground">Repositories Added</p>
              <p className="font-medium">{selectedRepos.length}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Next steps */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg">Quick Actions</h3>

        <div className="space-y-3">
          <Card className="p-5 hover:bg-accent transition-colors cursor-pointer group">
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Rocket className="w-6 h-6 text-primary" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-semibold">Create Your First Environment</h4>
                  <p className="text-sm text-muted-foreground">
                    Set up an isolated development environment for one of your repositories
                  </p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
            </div>
          </Card>

          <Card className="p-5 hover:bg-accent transition-colors cursor-pointer group">
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                  <BookOpen className="w-6 h-6 text-blue-500" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-semibold">Explore Documentation</h4>
                  <p className="text-sm text-muted-foreground">
                    Learn about advanced features, best practices, and tips
                  </p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
            </div>
          </Card>

          <Card className="p-5 hover:bg-accent transition-colors cursor-pointer group">
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                  <MessageCircle className="w-6 h-6 text-purple-500" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-semibold">Join the Community</h4>
                  <p className="text-sm text-muted-foreground">
                    Connect with other developers and get help when you need it
                  </p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-purple-500 group-hover:translate-x-1 transition-all" />
            </div>
          </Card>
        </div>
      </div>

      {/* Help section */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-5 flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-lg">👋</span>
        </div>
        <div className="space-y-2">
          <p className="font-semibold text-sm">Need Help?</p>
          <p className="text-sm text-muted-foreground">
            Check out our documentation or reach out to our support team. We're here to help you succeed!
          </p>
        </div>
      </div>
    </div>
  );
}
