import {
  MIRROR_LOCAL_STATUS_MESSAGES,
  type MirrorLocalProgress,
  type MirrorLocalState,
} from "@cmux/shared";
import {
  MirrorLocalPackError,
  type MirrorLocalPack,
} from "./mirror-local-pack";

export type MirrorLocalHostService = {
  createPack(): Promise<MirrorLocalPack>;
};

export type MirrorLocalSandboxIdentity = {
  instanceId: string;
  provider?: string;
};

export type MirrorLocalStartupOutcome = {
  state: Extract<
    MirrorLocalState,
    "applied" | "empty" | "unsupported" | "failed"
  >;
  policyVersion?: string;
  fileCount?: number;
  compressedBytes?: number;
  errorCode?: string;
  message: string;
};

type ProgressWithoutTaskRun = Omit<MirrorLocalProgress, "taskRunId">;

export type RunMirrorLocalStartupOptions<
  TSandbox extends MirrorLocalSandboxIdentity,
> = {
  hostService?: MirrorLocalHostService;
  startSandbox(): Promise<TSandbox>;
  applyPack(input: {
    instanceId: string;
    pack: MirrorLocalPack;
    onProgress: (state: "uploading" | "applying") => void;
  }): Promise<void>;
  onProgress?: (progress: ProgressWithoutTaskRun) => void;
  onError?: (phase: "packing" | "applying", error: unknown) => void;
};

function packMetadata(
  pack: MirrorLocalPack,
): Pick<
  ProgressWithoutTaskRun,
  "policyVersion" | "fileCount" | "compressedBytes"
> {
  return {
    policyVersion: pack.policyVersion,
    fileCount: pack.fileCount,
    compressedBytes: pack.compressedBytes,
  };
}

export async function runMirrorLocalStartup<
  TSandbox extends MirrorLocalSandboxIdentity,
>({
  hostService,
  startSandbox,
  applyPack,
  onProgress,
  onError,
}: RunMirrorLocalStartupOptions<TSandbox>): Promise<
  TSandbox & MirrorLocalStartupOutcome
> {
  if (!hostService) {
    throw new Error(
      "Mirror local requires a trusted Electron host service; browser and standalone server requests are not supported.",
    );
  }

  onProgress?.({
    state: "packing",
    message: MIRROR_LOCAL_STATUS_MESSAGES.packing,
  });

  let pack: MirrorLocalPack | null = null;
  let packErrorCode: string | null = null;
  try {
    pack = await hostService.createPack();
  } catch (error) {
    onError?.("packing", error);
    packErrorCode =
      error instanceof MirrorLocalPackError ? error.code : "pack-failed";
  }

  onProgress?.({
    state: "starting-sandbox",
    message: MIRROR_LOCAL_STATUS_MESSAGES["starting-sandbox"],
    ...(pack ? packMetadata(pack) : {}),
  });
  const sandbox = await startSandbox();

  if (!pack) {
    const outcome: MirrorLocalStartupOutcome = {
      state: "failed",
      errorCode: packErrorCode ?? "pack-failed",
      message: MIRROR_LOCAL_STATUS_MESSAGES.failed,
    };
    onProgress?.(outcome);
    return { ...sandbox, ...outcome };
  }

  if (pack.fileCount === 0) {
    const outcome: MirrorLocalStartupOutcome = {
      state: "empty",
      ...packMetadata(pack),
      message: MIRROR_LOCAL_STATUS_MESSAGES.empty,
    };
    onProgress?.(outcome);
    return { ...sandbox, ...outcome };
  }

  if (sandbox.provider !== "pve-lxc") {
    const outcome: MirrorLocalStartupOutcome = {
      state: "unsupported",
      ...packMetadata(pack),
      errorCode: "unsupported-provider",
      message: MIRROR_LOCAL_STATUS_MESSAGES.unsupported,
    };
    onProgress?.(outcome);
    return { ...sandbox, ...outcome };
  }

  try {
    await applyPack({
      instanceId: sandbox.instanceId,
      pack,
      onProgress: (state) => {
        onProgress?.({
          state,
          message: MIRROR_LOCAL_STATUS_MESSAGES[state],
          ...packMetadata(pack),
        });
      },
    });
  } catch (error) {
    onError?.("applying", error);
    const outcome: MirrorLocalStartupOutcome = {
      state: "failed",
      ...packMetadata(pack),
      errorCode: "apply-failed",
      message: MIRROR_LOCAL_STATUS_MESSAGES.failed,
    };
    onProgress?.(outcome);
    return { ...sandbox, ...outcome };
  }

  const outcome: MirrorLocalStartupOutcome = {
    state: "applied",
    ...packMetadata(pack),
    message: MIRROR_LOCAL_STATUS_MESSAGES.applied,
  };
  onProgress?.(outcome);
  return { ...sandbox, ...outcome };
}
