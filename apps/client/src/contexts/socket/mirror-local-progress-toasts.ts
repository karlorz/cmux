import type { MirrorLocalProgress } from "@cmux/shared";
import { toast } from "sonner";
import type { CmuxSocket } from "./types";

type ToastId = ReturnType<typeof toast.loading>;

type MirrorLocalToastApi = {
  loading: typeof toast.loading;
  success: typeof toast.success;
  warning: typeof toast.warning;
  dismiss: typeof toast.dismiss;
};

export function createMirrorLocalProgressToastController(
  toastApi: MirrorLocalToastApi = toast,
) {
  const toastIds = new Map<string, ToastId>();

  const handle = (progress: MirrorLocalProgress): void => {
    const existingId = toastIds.get(progress.taskRunId);
    const metadata =
      progress.fileCount !== undefined &&
      progress.compressedBytes !== undefined
        ? `${progress.fileCount} files · ${Math.ceil(progress.compressedBytes / 1024)} KiB`
        : undefined;

    if (
      progress.state === "packing" ||
      progress.state === "starting-sandbox" ||
      progress.state === "uploading" ||
      progress.state === "applying"
    ) {
      const id = toastApi.loading(progress.message, {
        id: existingId,
        description: metadata,
        duration: Infinity,
      });
      toastIds.set(progress.taskRunId, id);
      return;
    }

    const options = {
      id: existingId,
      description: metadata,
      duration: 8_000,
    };
    if (progress.state === "applied") {
      toastApi.success(progress.message, options);
    } else {
      toastApi.warning(progress.message, options);
    }
    toastIds.delete(progress.taskRunId);
  };

  const dismissAll = (): void => {
    for (const id of toastIds.values()) {
      toastApi.dismiss(id);
    }
    toastIds.clear();
  };

  return { handle, dismissAll };
}

export function registerMirrorLocalProgressToasts(
  socket: CmuxSocket,
): () => void {
  const controller = createMirrorLocalProgressToastController();
  socket.on("mirror-local-progress", controller.handle);

  return () => {
    socket.off("mirror-local-progress", controller.handle);
    controller.dismissAll();
  };
}
