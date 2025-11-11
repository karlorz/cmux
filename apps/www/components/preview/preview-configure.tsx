"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Check } from "lucide-react";

interface Installation {
  _id: string;
  installationId: number;
  accountLogin?: string;
  accountType?: "User" | "Organization";
  isActive?: boolean;
}

interface PreviewConfigureProps {
  user: {
    userId: string;
    email: string;
  };
  team: {
    teamId: string;
    teamName?: string;
  };
  installations: Installation[];
}

export function PreviewConfigure({
  user,
  team,
  installations,
}: PreviewConfigureProps) {
  const router = useRouter();
  const [step, setStep] = useState<"install" | "select" | "configure">(
    installations.length > 0 ? "select" : "install"
  );

  const [selectedInstallation, setSelectedInstallation] = useState<
    Installation | undefined
  >();
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [repos, setRepos] = useState<
    Array<{ fullName: string; private: boolean }>
  >([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);

  const [devScript, setDevScript] = useState("npm run dev");
  const [maintenanceScript, setMaintenanceScript] = useState("npm install");
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>(
    []
  );
  const [baseUrls, setBaseUrls] = useState<string[]>([
    "http://localhost:3000",
  ]);
  const [browser, setBrowser] = useState("chrome");
  const [isSaving, setIsSaving] = useState(false);

  const handleInstallApp = async () => {
    // Generate install state
    const response = await fetch("/api/integrations/github/install-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      alert("Failed to generate installation state");
      return;
    }

    const { state } = await response.json();

    // Redirect to GitHub app installation
    const installUrl = new URL(
      "https://github.com/apps/cmux/installations/new"
    );
    installUrl.searchParams.set("state", state);

    window.location.href = installUrl.toString();
  };

  const handleSelectInstallation = async (installationId: number) => {
    const installation = installations.find(
      (i) => i.installationId === installationId
    );
    setSelectedInstallation(installation);

    // Load repos for this installation
    setIsLoadingRepos(true);
    try {
      const response = await fetch(
        `/api/integrations/github/repos?installationId=${installationId}`
      );
      if (response.ok) {
        const data = await response.json();
        setRepos(data.repos || []);
        setStep("select");
      }
    } catch (error) {
      console.error("Failed to load repos:", error);
      alert("Failed to load repositories");
    } finally {
      setIsLoadingRepos(false);
    }
  };

  const handleSelectRepo = (repoFullName: string) => {
    setSelectedRepo(repoFullName);
    setStep("configure");
  };

  const handleAddEnvVar = () => {
    setEnvVars([...envVars, { key: "", value: "" }]);
  };

  const handleRemoveEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  const handleUpdateEnvVar = (
    index: number,
    field: "key" | "value",
    value: string
  ) => {
    const updated = [...envVars];
    updated[index][field] = value;
    setEnvVars(updated);
  };

  const handleAddBaseUrl = () => {
    setBaseUrls([...baseUrls, ""]);
  };

  const handleRemoveBaseUrl = (index: number) => {
    setBaseUrls(baseUrls.filter((_, i) => i !== index));
  };

  const handleUpdateBaseUrl = (index: number, value: string) => {
    const updated = [...baseUrls];
    updated[index] = value;
    setBaseUrls(updated);
  };

  const handleSave = async () => {
    if (!selectedInstallation || !selectedRepo) {
      alert("Please select an installation and repository");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/preview/configurations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: team.teamId,
          repoFullName: selectedRepo,
          installationId: selectedInstallation.installationId,
          devScript,
          maintenanceScript,
          environmentVariables: envVars.filter((v) => v.key && v.value),
          baseUrls: baseUrls.filter((url) => url),
          browser,
        }),
      });

      if (response.ok) {
        alert("Configuration saved successfully!");
        router.push("/preview/dashboard");
      } else {
        const error = await response.json();
        alert(`Failed to save configuration: ${error.message}`);
      }
    } catch (error) {
      console.error("Failed to save configuration:", error);
      alert("Failed to save configuration");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-4 py-12">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold text-neutral-900 dark:text-neutral-100">
          Configure Preview
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          Set up automatic screenshot capture for your repository
        </p>
      </div>

      {/* Step 1: Install GitHub App */}
      {step === "install" && (
        <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="mb-4 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            Install cmux GitHub App
          </h2>
          <p className="mb-6 text-neutral-600 dark:text-neutral-400">
            To get started, you need to install the cmux GitHub App on your
            repositories. This allows us to monitor pull requests and capture
            screenshots.
          </p>
          <Button onClick={handleInstallApp}>Install GitHub App</Button>
        </div>
      )}

      {/* Step 2: Select Installation & Repo */}
      {step === "select" && installations.length > 0 && (
        <div className="space-y-6">
          <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="mb-4 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              Select GitHub Installation
            </h2>
            <div className="space-y-4">
              {installations.map((installation) => (
                <button
                  key={installation._id}
                  className="flex w-full items-center justify-between rounded-lg border border-neutral-200 p-4 text-left hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800"
                  onClick={() =>
                    handleSelectInstallation(installation.installationId)
                  }
                  disabled={isLoadingRepos}
                >
                  <div>
                    <div className="font-medium text-neutral-900 dark:text-neutral-100">
                      {installation.accountLogin || "Unknown"}
                    </div>
                    <div className="text-sm text-neutral-500 dark:text-neutral-400">
                      {installation.accountType}
                    </div>
                  </div>
                  {selectedInstallation?.installationId ===
                    installation.installationId && (
                    <Check className="h-5 w-5 text-green-600" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {selectedInstallation && repos.length > 0 && (
            <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
              <h2 className="mb-4 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
                Select Repository
              </h2>
              <div className="space-y-2">
                {repos.map((repo) => (
                  <button
                    key={repo.fullName}
                    className="flex w-full items-center justify-between rounded-lg border border-neutral-200 p-4 text-left hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800"
                    onClick={() => handleSelectRepo(repo.fullName)}
                  >
                    <div>
                      <div className="font-medium text-neutral-900 dark:text-neutral-100">
                        {repo.fullName}
                      </div>
                      {repo.private && (
                        <div className="text-sm text-neutral-500 dark:text-neutral-400">
                          Private
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Configure Environment */}
      {step === "configure" && (
        <div className="space-y-6">
          <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="mb-1 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              Repository: {selectedRepo}
            </h2>
            <p className="mb-6 text-sm text-neutral-600 dark:text-neutral-400">
              Configure how to run and test your application
            </p>

            <div className="space-y-6">
              {/* Scripts */}
              <div>
                <Label htmlFor="devScript">Development Server Command</Label>
                <Input
                  id="devScript"
                  value={devScript}
                  onChange={(e) => setDevScript(e.target.value)}
                  placeholder="npm run dev"
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="maintenanceScript">Setup Command</Label>
                <Input
                  id="maintenanceScript"
                  value={maintenanceScript}
                  onChange={(e) => setMaintenanceScript(e.target.value)}
                  placeholder="npm install"
                  className="mt-2"
                />
              </div>

              {/* Base URLs */}
              <div>
                <Label>Base URLs to Screenshot</Label>
                <div className="mt-2 space-y-2">
                  {baseUrls.map((url, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={url}
                        onChange={(e) =>
                          handleUpdateBaseUrl(index, e.target.value)
                        }
                        placeholder="http://localhost:3000"
                      />
                      {baseUrls.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveBaseUrl(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddBaseUrl}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add URL
                  </Button>
                </div>
              </div>

              {/* Browser */}
              <div>
                <Label htmlFor="browser">Browser</Label>
                <Select value={browser} onValueChange={setBrowser}>
                  <SelectTrigger id="browser" className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chrome">Chrome</SelectItem>
                    <SelectItem value="firefox">Firefox</SelectItem>
                    <SelectItem value="safari">Safari</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Environment Variables */}
              <div>
                <Label>Environment Variables</Label>
                <div className="mt-2 space-y-2">
                  {envVars.map((envVar, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={envVar.key}
                        onChange={(e) =>
                          handleUpdateEnvVar(index, "key", e.target.value)
                        }
                        placeholder="KEY"
                        className="flex-1"
                      />
                      <Input
                        value={envVar.value}
                        onChange={(e) =>
                          handleUpdateEnvVar(index, "value", e.target.value)
                        }
                        placeholder="value"
                        className="flex-1"
                        type="password"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveEnvVar(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={handleAddEnvVar}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Variable
                  </Button>
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep("select");
                    setSelectedRepo("");
                  }}
                >
                  Back
                </Button>
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save Configuration"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
