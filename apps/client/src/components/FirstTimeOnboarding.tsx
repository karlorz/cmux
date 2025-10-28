import { useState, useEffect } from 'react';
import { useUser } from '@stackframe/react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@cmux/convex/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Github, Loader2, Rocket, ChevronRight } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { isElectron } from '@/lib/electron';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  completed: boolean;
}

export function FirstTimeOnboarding({ teamId }: { teamId: string }) {
  const user = useUser();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [isConnecting, setIsConnecting] = useState(false);
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [isInstallingAgent, setIsInstallingAgent] = useState(false);

  // Check if user has completed onboarding
  const userProfile = useQuery(api.users.getUser, { userId: user?.id ?? '' });
  const hasCompletedOnboarding = userProfile?.hasCompletedOnboarding ?? false;

  // Get provider connections for the team
  const connections = useQuery(api.github.getProviderConnections, { teamId });
  const hasGitHubConnected = (connections?.length ?? 0) > 0;

  // Get repositories if GitHub is connected
  const repos = useQuery(
    api.github.getReposByTeam,
    hasGitHubConnected ? { teamId } : 'skip'
  );

  // Mutations
  const mintInstallState = useMutation(api.github_app.mintInstallState);
  const markOnboardingComplete = useMutation(api.users.markOnboardingComplete);
  const installAgentInRepos = useMutation(api.github.installAgentInRepos);

  const steps: OnboardingStep[] = [
    {
      id: 'welcome',
      title: 'Welcome to CMUX',
      description: "Let's get you set up with your first repositories",
      icon: <Rocket className="h-6 w-6" />,
      completed: true,
    },
    {
      id: 'connect-github',
      title: 'Connect GitHub',
      description: 'Link your GitHub account to access your repositories',
      icon: <Github className="h-6 w-6" />,
      completed: hasGitHubConnected,
    },
    {
      id: 'select-repos',
      title: 'Select Repositories',
      description: 'Choose which repositories to set up with CMUX',
      icon: <CheckCircle2 className="h-6 w-6" />,
      completed: selectedRepos.length > 0,
    },
    {
      id: 'install-agent',
      title: 'Install CMUX Agent',
      description: 'Set up the CMUX agent in your selected repositories',
      icon: <Loader2 className="h-6 w-6" />,
      completed: false,
    },
  ];

  useEffect(() => {
    // Auto-advance to next incomplete step
    if (hasGitHubConnected && currentStep === 1) {
      setCurrentStep(2);
    }
  }, [hasGitHubConnected, currentStep]);

  const handleConnectGitHub = async () => {
    try {
      setIsConnecting(true);
      const installState = await mintInstallState({ teamSlugOrId: teamId });

      const githubAppUrl = new URL('https://github.com/apps/cmux-app/installations/new');
      githubAppUrl.searchParams.set('state', installState);

      if (isElectron) {
        // For Electron, open in external browser
        window.open(githubAppUrl.toString(), '_blank');
      } else {
        // For web, redirect
        window.location.href = githubAppUrl.toString();
      }
    } catch (error) {
      console.error('Error connecting GitHub:', error);
      toast.error('Failed to connect GitHub. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleInstallAgent = async () => {
    if (selectedRepos.length === 0) {
      toast.error('Please select at least one repository');
      return;
    }

    try {
      setIsInstallingAgent(true);

      // Install agent in all selected repositories
      await installAgentInRepos({
        teamId,
        repoIds: selectedRepos as any, // Convert string[] to Id<"repos">[]
        setupType: 'github_actions', // or 'webhook' based on preference
      });

      // Mark onboarding as complete
      await markOnboardingComplete({ userId: user?.id ?? '' });

      toast.success('CMUX agent installed successfully!');

      // Navigate to dashboard
      navigate({
        to: '/$teamSlugOrId/dashboard',
        params: { teamSlugOrId: teamId },
      });
    } catch (error) {
      console.error('Error installing agent:', error);
      toast.error('Failed to install agent. Please try again.');
    } finally {
      setIsInstallingAgent(false);
    }
  };

  // Skip onboarding if already completed
  if (hasCompletedOnboarding) {
    return null;
  }

  return (
    <Dialog.Root open={!hasCompletedOnboarding}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 max-w-3xl translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg rounded-lg">
          <Dialog.Title className="text-lg font-semibold">Welcome to CMUX!</Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground">
            Let's get you set up with your repositories in just a few steps.
          </Dialog.Description>

        <div className="space-y-6 py-4">
          {/* Progress Steps */}
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={`flex items-center ${index !== steps.length - 1 ? 'flex-1' : ''}`}
              >
                <div
                  className={`flex items-center justify-center w-12 h-12 rounded-full border-2 ${
                    step.completed || index <= currentStep
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted-foreground text-muted-foreground'
                  }`}
                >
                  {step.completed ? <CheckCircle2 className="h-6 w-6" /> : step.icon}
                </div>
                {index !== steps.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 ${
                      steps[index + 1].completed || index < currentStep
                        ? 'bg-primary'
                        : 'bg-muted-foreground/20'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Step Content */}
          <Card>
            <CardHeader>
              <CardTitle>{steps[currentStep].title}</CardTitle>
              <CardDescription>{steps[currentStep].description}</CardDescription>
            </CardHeader>
            <CardContent>
              {currentStep === 0 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    CMUX helps you manage pull requests and collaborate on code with AI assistance.
                    We'll help you connect your GitHub repositories and install the CMUX agent.
                  </p>
                  <Button onClick={() => setCurrentStep(1)} className="w-full">
                    Get Started
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              )}

              {currentStep === 1 && (
                <div className="space-y-4">
                  {!hasGitHubConnected ? (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Connect your GitHub account to access your repositories and enable CMUX features.
                      </p>
                      <Button
                        onClick={handleConnectGitHub}
                        disabled={isConnecting}
                        className="w-full"
                      >
                        {isConnecting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <Github className="mr-2 h-4 w-4" />
                            Connect GitHub Account
                          </>
                        )}
                      </Button>
                    </>
                  ) : (
                    <div className="text-center space-y-4">
                      <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
                      <p className="text-sm text-muted-foreground">
                        GitHub account connected successfully!
                      </p>
                      <Button onClick={() => setCurrentStep(2)} className="w-full">
                        Continue to Repository Selection
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Select the repositories where you want to install the CMUX agent.
                  </p>
                  <div className="max-h-64 overflow-y-auto space-y-2 border rounded-lg p-4">
                    {repos?.map((repo: any) => (
                      <label
                        key={repo._id}
                        className="flex items-center space-x-3 cursor-pointer hover:bg-accent rounded-lg p-2"
                      >
                        <input
                          type="checkbox"
                          className="rounded border-gray-300"
                          checked={selectedRepos.includes(repo._id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedRepos([...selectedRepos, repo._id]);
                            } else {
                              setSelectedRepos(selectedRepos.filter((id) => id !== repo._id));
                            }
                          }}
                        />
                        <div className="flex-1">
                          <div className="font-medium">{repo.fullName}</div>
                          <div className="text-xs text-muted-foreground">
                            {repo.visibility === 'private' ? '🔒 Private' : '🌐 Public'}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <Button
                    onClick={() => setCurrentStep(3)}
                    disabled={selectedRepos.length === 0}
                    className="w-full"
                  >
                    Continue with {selectedRepos.length} {selectedRepos.length === 1 ? 'Repository' : 'Repositories'}
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              )}

              {currentStep === 3 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    We'll now install the CMUX agent in your selected repositories. This enables:
                  </p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>Automatic PR analysis and suggestions</li>
                    <li>Code review assistance</li>
                    <li>Branch management</li>
                    <li>CI/CD integration</li>
                  </ul>
                  <div className="border rounded-lg p-4 bg-muted/20">
                    <h4 className="font-medium mb-2">Selected Repositories:</h4>
                    <div className="space-y-1">
                      {selectedRepos.map((repoId) => {
                        const repo = repos?.find((r: any) => r._id === repoId);
                        return (
                          <div key={repoId} className="text-sm">
                            • {repo?.fullName}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <Button
                    onClick={handleInstallAgent}
                    disabled={isInstallingAgent}
                    className="w-full"
                  >
                    {isInstallingAgent ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Installing Agent...
                      </>
                    ) : (
                      <>
                        <Rocket className="mr-2 h-4 w-4" />
                        Complete Setup
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}