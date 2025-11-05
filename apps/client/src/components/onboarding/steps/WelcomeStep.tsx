import { Rocket, Github, Boxes, Zap } from "lucide-react";

export function WelcomeStep() {
  return (
    <div className="flex flex-col items-center text-center space-y-8 py-8">
      {/* Hero Section */}
      <div className="space-y-4">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
          <Rocket className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight">
          Welcome to cmux
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl">
          Your powerful development environment manager. Let's get you set up in just a few steps.
        </p>
      </div>

      {/* Feature highlights */}
      <div className="grid grid-cols-3 gap-6 w-full max-w-3xl pt-4">
        <div className="flex flex-col items-center space-y-3 p-6 rounded-xl border border-border bg-card/50 hover:bg-card transition-colors">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Github className="w-6 h-6 text-primary" />
          </div>
          <h3 className="font-semibold">Connect GitHub</h3>
          <p className="text-sm text-muted-foreground">
            Link your repositories and enable seamless integration
          </p>
        </div>

        <div className="flex flex-col items-center space-y-3 p-6 rounded-xl border border-border bg-card/50 hover:bg-card transition-colors">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Boxes className="w-6 h-6 text-primary" />
          </div>
          <h3 className="font-semibold">Manage Environments</h3>
          <p className="text-sm text-muted-foreground">
            Create isolated environments for each project
          </p>
        </div>

        <div className="flex flex-col items-center space-y-3 p-6 rounded-xl border border-border bg-card/50 hover:bg-card transition-colors">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Zap className="w-6 h-6 text-primary" />
          </div>
          <h3 className="font-semibold">Deploy Fast</h3>
          <p className="text-sm text-muted-foreground">
            Go from code to production in minutes
          </p>
        </div>
      </div>

      {/* Call to action */}
      <div className="pt-4">
        <p className="text-sm text-muted-foreground">
          This will take approximately 2-3 minutes
        </p>
      </div>
    </div>
  );
}
