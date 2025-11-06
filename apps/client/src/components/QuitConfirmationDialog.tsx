import { Button } from "@/components/ui/button";
import { setQuitPreference } from "@/lib/quit-preference";
import * as Dialog from "@radix-ui/react-dialog";
import { useCallback, useEffect, useState } from "react";

interface QuitConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmQuit: () => void;
}

export function QuitConfirmationDialog({
  open,
  onOpenChange,
  onConfirmQuit,
}: QuitConfirmationDialogProps) {
  const [alwaysQuit, setAlwaysQuit] = useState(false);

  useEffect(() => {
    if (!open) {
      setAlwaysQuit(false);
    }
  }, [open]);

  const handleQuit = useCallback(() => {
    if (alwaysQuit) {
      setQuitPreference(true);
    }
    onConfirmQuit();
  }, [alwaysQuit, onConfirmQuit]);

  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-neutral-950/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl focus:outline-none dark:border-neutral-800 dark:bg-neutral-900">
          <div>
            <Dialog.Title className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
              Quit cmux?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Are you sure you want to quit? Any unsaved changes may be lost.
            </Dialog.Description>
          </div>

          <div className="mt-5">
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={alwaysQuit}
                onChange={(e) => setAlwaysQuit(e.target.checked)}
                className="h-4 w-4 cursor-pointer rounded border-neutral-300 text-primary transition focus:ring-2 focus:ring-primary/20 focus:ring-offset-0 dark:border-neutral-600 dark:bg-neutral-800"
                aria-describedby="quit-checkbox-description"
              />
              <span
                id="quit-checkbox-description"
                className="text-sm text-neutral-700 group-hover:text-neutral-900 dark:text-neutral-300 dark:group-hover:text-neutral-100"
              >
                Always quit without asking
              </span>
            </label>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={handleCancel}
              className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-50"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleQuit}
              className="bg-destructive text-white hover:bg-destructive/90 dark:bg-red-600 dark:hover:bg-red-700"
            >
              Quit
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
