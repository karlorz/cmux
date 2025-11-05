import { useState } from "react";
import { Github, Check, AlertCircle, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface GitHubConnectionStepProps {
  hasConnected: boolean;
  onConnectionChange: (connected: boolean) => void;
  selectedRepos: string[];
  onReposChange: (repos: string[]) => void;
}

export function GitHubConnectionStep({
  hasConnected,
  onConnectionChange,
  selectedRepos,
  onReposChange,
}: GitHubConnectionStepProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Mock data for demo - replace with actual Convex queries
  const mockRepos = hasConnected ? [
    { _id: "1", name: "my-awesome-project", description: "A great project", private: false },
    { _id: "2", name: "secret-repo", description: "Private repository", private: true },
    { _id: "3", name: "demo-app", description: "Demo application", private: false },
  ] : [];

  const handleConnectGitHub = async () => {
    setIsConnecting(true);
    try {
      // Open GitHub App installation in popup
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        `${import.meta.env.VITE_BACKEND_URL}/auth/github/install`,
        "github-install",
        `width=${width},height=${height},left=${left},top=${top}`
      );

      // Poll for connection
      const pollInterval = setInterval(() => {
        if (popup?.closed) {
          clearInterval(pollInterval);
          setIsConnecting(false);
          // Simulate successful connection for demo
          onConnectionChange(true);
        }
      }, 500);
    } catch (error) {
      console.error("Failed to connect GitHub:", error);
      setIsConnecting(false);
    }
  };

  const filteredRepos = mockRepos.filter((repo) =>
    repo.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleRepo = (repoId: string) => {
    if (selectedRepos.includes(repoId)) {
      onReposChange(selectedRepos.filter((id) => id !== repoId));
    } else {
      onReposChange([...selectedRepos, repoId]);
    }
  };

  const selectAllVisible = () => {
    const visibleRepoIds = filteredRepos.map((r) => r._id);
    onReposChange([...new Set([...selectedRepos, ...visibleRepoIds])]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 mb-2">
          <Github className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Connect Your GitHub Account</h2>
        <p className="text-muted-foreground">
          Connect your GitHub account to manage repositories and enable powerful integrations
        </p>
      </div>

      {/* Connection Status */}
      {!hasConnected ? (
        <div className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              You'll need to authorize cmux to access your GitHub repositories. We only request the minimum permissions needed.
            </AlertDescription>
          </Alert>

          <div className="flex justify-center pt-4">
            <Button
              size="lg"
              onClick={handleConnectGitHub}
              disabled={isConnecting}
              className="gap-2"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Github className="w-5 h-5" />
                  Connect GitHub Account
                </>
              )}
            </Button>
          </div>

          <div className="text-center text-sm text-muted-foreground pt-2">
            <p>By connecting, you agree to grant cmux access to your repositories</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Success message */}
          <Alert className="bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400">
            <Check className="h-4 w-4" />
            <AlertDescription>
              GitHub account connected successfully! Now select the repositories you want to work with.
            </AlertDescription>
          </Alert>

          {/* Repository selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Select Repositories</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={selectAllVisible}
                className="h-8 text-xs"
              >
                Select all visible
              </Button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search repositories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Repository list */}
            <ScrollArea className="h-[280px] border rounded-lg">
              <div className="p-2 space-y-1">
                {filteredRepos.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                    {searchQuery ? "No repositories found" : "No repositories available"}
                  </div>
                ) : (
                  filteredRepos.map((repo) => (
                    <div
                      key={repo._id}
                      className={cn(
                        "flex items-center space-x-3 p-3 rounded-md hover:bg-accent cursor-pointer transition-colors",
                        selectedRepos.includes(repo._id) && "bg-accent"
                      )}
                      onClick={() => toggleRepo(repo._id)}
                    >
                      <Checkbox
                        checked={selectedRepos.includes(repo._id)}
                        onCheckedChange={() => toggleRepo(repo._id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{repo.name}</p>
                        {repo.description && (
                          <p className="text-xs text-muted-foreground truncate">
                            {repo.description}
                          </p>
                        )}
                      </div>
                      {repo.private && (
                        <span className="text-xs px-2 py-0.5 bg-muted rounded-full">
                          Private
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            <p className="text-sm text-muted-foreground">
              {selectedRepos.length} {selectedRepos.length === 1 ? "repository" : "repositories"} selected
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
