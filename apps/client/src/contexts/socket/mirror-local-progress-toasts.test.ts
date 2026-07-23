import type { MirrorLocalProgress } from "@cmux/shared";
import { describe, expect, it, vi } from "vitest";
import { createMirrorLocalProgressToastController } from "./mirror-local-progress-toasts";

function progress(
  state: MirrorLocalProgress["state"],
  message: string,
): MirrorLocalProgress {
  return {
    taskRunId: "task-run-1",
    state,
    message,
    fileCount: 3,
    compressedBytes: 2_048,
  };
}

describe("createMirrorLocalProgressToastController", () => {
  it("updates one loading toast through completion", () => {
    const toastApi = {
      loading: vi.fn().mockReturnValue("mirror-toast"),
      success: vi.fn().mockReturnValue("mirror-toast"),
      warning: vi.fn().mockReturnValue("mirror-toast"),
      dismiss: vi.fn(),
    };
    const controller = createMirrorLocalProgressToastController(toastApi);

    controller.handle(progress("packing", "Packing…"));
    controller.handle(progress("uploading", "Uploading…"));
    controller.handle(progress("applied", "Ready"));

    expect(toastApi.loading).toHaveBeenNthCalledWith(
      1,
      "Packing…",
      expect.objectContaining({ id: undefined, duration: Infinity }),
    );
    expect(toastApi.loading).toHaveBeenNthCalledWith(
      2,
      "Uploading…",
      expect.objectContaining({ id: "mirror-toast", duration: Infinity }),
    );
    expect(toastApi.success).toHaveBeenCalledWith(
      "Ready",
      expect.objectContaining({
        id: "mirror-toast",
        description: "3 files · 2 KiB",
      }),
    );

    controller.dismissAll();
    expect(toastApi.dismiss).not.toHaveBeenCalled();
  });

  it("dismisses an active toast when its socket provider disconnects", () => {
    const toastApi = {
      loading: vi.fn().mockReturnValue("mirror-toast"),
      success: vi.fn().mockReturnValue("mirror-toast"),
      warning: vi.fn().mockReturnValue("mirror-toast"),
      dismiss: vi.fn(),
    };
    const controller = createMirrorLocalProgressToastController(toastApi);

    controller.handle(progress("packing", "Packing…"));
    controller.dismissAll();

    expect(toastApi.dismiss).toHaveBeenCalledWith("mirror-toast");
  });
});
