import { EnvironmentSetupFlow } from "@/components/environment";
import { FloatingPane } from "@/components/floating-pane";
import { RepositoryPicker } from "@/components/RepositoryPicker";
import { TitleBar } from "@/components/TitleBar";
import {
  clearEnvironmentDraft,
  persistEnvironmentDraftMetadata,
  useEnvironmentDraft,
} from "@/state/environment-draft-store";
import {
  DEFAULT_MORPH_SNAPSHOT_ID,
  MORPH_SNAPSHOT_PRESETS,
  type MorphSnapshotId,
} from "@cmux/shared";
import { postApiMorphSetupInstanceMutation } from "@cmux/www-openapi-client/react-query";
import { useMutation as useRQMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { z } from "zod";

const morphSnapshotIds = MORPH_SNAPSHOT_PRESETS.map(
  (preset) => preset.id
) as [MorphSnapshotId, ...MorphSnapshotId[]];

const searchSchema = z.object({
  step: z.enum(["select", "configure"]).default("select"),
  selectedRepos: z.array(z.string()).default([]),
  instanceId: z.string().optional(),
  connectionLogin: z.string().optional(),
  repoSearch: z.string().optional(),
  snapshotId: z.enum(morphSnapshotIds).default(DEFAULT_MORPH_SNAPSHOT_ID),
});

const haveSameRepos = (
  a: readonly string[],
  b: readonly string[],
): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  const counts = new Map<string, number>();
  for (const repo of a) {
    counts.set(repo, (counts.get(repo) ?? 0) + 1);
  }
  for (const repo of b) {
    const next = counts.get(repo);
    if (!next) {
      return false;
    }
    if (next === 1) {
      counts.delete(repo);
    } else {
      counts.set(repo, next - 1);
    }
  }
  return counts.size === 0;
};

export const Route = createFileRoute("/_layout/$teamSlugOrId/environments/new")(
  {
    component: EnvironmentsPage,
    validateSearch: searchSchema,
  }
);

function EnvironmentsPage() {
  const searchParams = Route.useSearch();
  const stepFromSearch = searchParams.step ?? "select";
  const urlSelectedRepos = searchParams.selectedRepos ?? [];
  const urlInstanceId = searchParams.instanceId;
  const searchSnapshotId =
    searchParams.snapshotId ?? DEFAULT_MORPH_SNAPSHOT_ID;
  const { teamSlugOrId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const draft = useEnvironmentDraft(teamSlugOrId);
  const [headerActions, setHeaderActions] = useState<ReactNode | null>(null);
  const skipDraftHydrationRef = useRef(false);
  const provisioningTriggeredRef = useRef(false);
  const hasCheckedFreshNavigationRef = useRef(false);

  // Detect fresh navigation and clear stale drafts
  // Fresh navigation = URL has step=select (or default), no instanceId, no selectedRepos
  // If draft exists with step=configure, it's stale and should be cleared
  const urlSelectedReposLength = urlSelectedRepos.length;
  useEffect(() => {
    if (hasCheckedFreshNavigationRef.current) {
      return;
    }
    hasCheckedFreshNavigationRef.current = true;

    const isFreshNavigation =
      stepFromSearch === "select" &&
      !urlInstanceId &&
      urlSelectedReposLength === 0;

    if (isFreshNavigation && draft?.step === "configure") {
      // Clear stale draft to start fresh
      clearEnvironmentDraft(teamSlugOrId);
    }
  }, [stepFromSearch, urlInstanceId, urlSelectedReposLength, draft, teamSlugOrId]);

  // Use URL step when it's a fresh navigation, otherwise use draft step
  const isFreshNavigation =
    stepFromSearch === "select" &&
    !urlInstanceId &&
    urlSelectedReposLength === 0;
  const activeStep = isFreshNavigation ? stepFromSearch : (draft?.step ?? stepFromSearch);
  const activeSelectedRepos = draft?.selectedRepos ?? urlSelectedRepos;
  const activeInstanceId = draft?.instanceId ?? urlInstanceId;
  const activeSnapshotId = draft?.snapshotId ?? searchSnapshotId;

  // Setup instance mutation for background provisioning
  const setupInstanceMutation = useRQMutation(postApiMorphSetupInstanceMutation());

  // Trigger provisioning when on configure step without instanceId
  useEffect(() => {
    if (activeStep !== "configure") {
      provisioningTriggeredRef.current = false;
      return;
    }

    // Skip if already have instanceId or already triggered or mutation is pending
    if (activeInstanceId || provisioningTriggeredRef.current || setupInstanceMutation.isPending) {
      return;
    }

    provisioningTriggeredRef.current = true;

    setupInstanceMutation.mutate(
      {
        body: {
          teamSlugOrId,
          selectedRepos: activeSelectedRepos,
          snapshotId: activeSnapshotId,
        },
      },
      {
        onSuccess: (data) => {
          // Update URL with instanceId
          void navigate({
            search: (prev) => ({
              ...prev,
              instanceId: data.instanceId,
            }),
            replace: true,
          });
          // Update draft with instanceId (preserves current step)
          persistEnvironmentDraftMetadata(
            teamSlugOrId,
            {
              selectedRepos: activeSelectedRepos,
              instanceId: data.instanceId,
              snapshotId: activeSnapshotId,
            },
            { resetConfig: false },
          );
          console.log("Instance provisioned:", data.instanceId);
          console.log("Cloned repos:", data.clonedRepos);
        },
        onError: (error) => {
          console.error("Failed to provision instance:", error);
          provisioningTriggeredRef.current = false; // Allow retry
        },
      }
    );
  }, [
    activeStep,
    activeInstanceId,
    activeSelectedRepos,
    activeSnapshotId,
    teamSlugOrId,
    navigate,
    setupInstanceMutation,
  ]);

  useEffect(() => {
    if (activeStep !== "configure") {
      setHeaderActions(null);
    }
  }, [activeStep]);

  useEffect(() => {
    if (activeStep !== "configure" || draft || skipDraftHydrationRef.current) {
      return;
    }
    persistEnvironmentDraftMetadata(
      teamSlugOrId,
      {
        selectedRepos: activeSelectedRepos,
        instanceId: activeInstanceId,
        snapshotId: activeSnapshotId,
      },
      { resetConfig: false, step: "configure" },
    );
  }, [
    activeInstanceId,
    activeSelectedRepos,
    activeSnapshotId,
    activeStep,
    draft,
    teamSlugOrId,
  ]);

  const handleStartConfigure = useCallback(
    (payload: {
      selectedRepos: string[];
      instanceId?: string;
      snapshotId?: MorphSnapshotId;
    }) => {
      const existingRepos = draft?.selectedRepos ?? [];
      const reposChanged = !haveSameRepos(existingRepos, payload.selectedRepos);
      const instanceChanged = draft?.instanceId !== payload.instanceId;
      const snapshotChanged = draft?.snapshotId !== payload.snapshotId;
      const shouldResetConfig =
        !draft || reposChanged || instanceChanged || snapshotChanged;

      skipDraftHydrationRef.current = false;
      persistEnvironmentDraftMetadata(
        teamSlugOrId,
        {
          selectedRepos: payload.selectedRepos,
          instanceId: payload.instanceId,
          snapshotId: payload.snapshotId,
        },
        { resetConfig: shouldResetConfig, step: "configure" },
      );
    },
    [draft, teamSlugOrId],
  );

  const handleBackToRepositorySelection = useCallback(async () => {
    // Update draft state
    persistEnvironmentDraftMetadata(
      teamSlugOrId,
      {
        selectedRepos: activeSelectedRepos,
        instanceId: activeInstanceId,
        snapshotId: activeSnapshotId,
      },
      { resetConfig: false, step: "select" },
    );
    // Update URL to match
    await navigate({
      search: (prev) => ({
        ...prev,
        step: "select",
      }),
    });
  }, [activeInstanceId, activeSelectedRepos, activeSnapshotId, teamSlugOrId, navigate]);

  const handleResetDraft = useCallback(() => {
    skipDraftHydrationRef.current = true;
    clearEnvironmentDraft(teamSlugOrId);
    setHeaderActions(null);
  }, [teamSlugOrId]);

  const handleDiscardAndExit = useCallback(async () => {
    handleResetDraft();
    await navigate({
      to: "/$teamSlugOrId/environments",
      params: { teamSlugOrId },
      search: {
        step: undefined,
        selectedRepos: undefined,
        connectionLogin: undefined,
        repoSearch: undefined,
        instanceId: undefined,
        snapshotId: undefined,
      },
    });
  }, [handleResetDraft, navigate, teamSlugOrId]);

  // For configure step, show the new EnvironmentSetupFlow without the floating pane
  // The new flow has its own full-screen layout
  if (activeStep === "configure") {
    return (
      <div className="h-full w-full overflow-auto">
        <EnvironmentSetupFlow
          teamSlugOrId={teamSlugOrId}
          selectedRepos={activeSelectedRepos}
          instanceId={activeInstanceId}
          initialEnvName={draft?.config?.envName}
          initialMaintenanceScript={draft?.config?.maintenanceScript}
          initialDevScript={draft?.config?.devScript}
          initialExposedPorts={draft?.config?.exposedPorts}
          initialEnvVars={draft?.config?.envVars}
          onEnvironmentSaved={handleResetDraft}
          onBack={handleBackToRepositorySelection}
        />
      </div>
    );
  }

  // For select step, show the repository picker in a floating pane
  return (
    <FloatingPane header={<TitleBar title="Environments" actions={headerActions} />}>
      <div className="flex flex-col grow select-none relative h-full overflow-hidden">
        <div className="p-6 max-w-3xl w-full mx-auto overflow-auto">
          <RepositoryPicker
            teamSlugOrId={teamSlugOrId}
            instanceId={activeInstanceId}
            initialSelectedRepos={activeSelectedRepos}
            initialSnapshotId={activeSnapshotId}
            showHeader={true}
            showContinueButton={true}
            showManualConfigOption={true}
            onStartConfigure={handleStartConfigure}
            topAccessory={
              <button
                type="button"
                onClick={handleDiscardAndExit}
                className="inline-flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to environments
              </button>
            }
          />
        </div>
      </div>
    </FloatingPane>
  );
}
