import { Boxes, Container, Play, Settings, Network, Shield } from "lucide-react";
import { Card } from "@/components/ui/card";

export function EnvironmentExplanationStep() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 mb-2">
          <Boxes className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Understanding Environments</h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Environments are isolated workspaces for your projects. Each environment runs independently with its own configuration, dependencies, and resources.
        </p>
      </div>

      {/* Visual explanation */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-5 space-y-3 border-2 hover:border-primary/50 transition-colors">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Container className="w-5 h-5 text-blue-500" />
          </div>
          <h3 className="font-semibold text-lg">Isolated Containers</h3>
          <p className="text-sm text-muted-foreground">
            Each environment runs in its own container, ensuring complete isolation from other projects. No conflicts, no interference.
          </p>
        </Card>

        <Card className="p-5 space-y-3 border-2 hover:border-primary/50 transition-colors">
          <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
            <Play className="w-5 h-5 text-green-500" />
          </div>
          <h3 className="font-semibold text-lg">Quick Start & Stop</h3>
          <p className="text-sm text-muted-foreground">
            Start and stop environments on-demand. Resources are only used when you need them, saving costs and improving performance.
          </p>
        </Card>

        <Card className="p-5 space-y-3 border-2 hover:border-primary/50 transition-colors">
          <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <Settings className="w-5 h-5 text-purple-500" />
          </div>
          <h3 className="font-semibold text-lg">Custom Configuration</h3>
          <p className="text-sm text-muted-foreground">
            Configure environment variables, build scripts, ports, and dependencies for each project independently.
          </p>
        </Card>

        <Card className="p-5 space-y-3 border-2 hover:border-primary/50 transition-colors">
          <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
            <Network className="w-5 h-5 text-orange-500" />
          </div>
          <h3 className="font-semibold text-lg">Team Collaboration</h3>
          <p className="text-sm text-muted-foreground">
            Share environments with your team. Everyone works with the same setup, eliminating "works on my machine" issues.
          </p>
        </Card>
      </div>

      {/* Example workflow */}
      <div className="bg-muted/30 border border-border rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">How It Works</h3>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5">
              1
            </div>
            <div>
              <p className="font-medium">Choose a repository</p>
              <p className="text-muted-foreground">Select from your connected GitHub repos</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5">
              2
            </div>
            <div>
              <p className="font-medium">Configure your environment</p>
              <p className="text-muted-foreground">Set up env vars, scripts, and ports</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5">
              3
            </div>
            <div>
              <p className="font-medium">Launch and develop</p>
              <p className="text-muted-foreground">Your environment starts in seconds, ready to use</p>
            </div>
          </div>
        </div>
      </div>

      {/* Pro tip */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-sm font-bold text-primary">💡</span>
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-sm">Pro Tip</p>
          <p className="text-sm text-muted-foreground">
            Create separate environments for development, staging, and production. This mirrors real-world deployment scenarios and helps catch issues early.
          </p>
        </div>
      </div>
    </div>
  );
}
