import { Button } from "@/components/ui/button";
import { isElectron } from "@/lib/electron";
import * as Dialog from "@radix-ui/react-dialog";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

type QuitUiBridge = {
  getQuitConfirmationPreference: () => Promise<{ skipPrompt: boolean }>;
  confirmQuit: (options?: { skipPrompt?: boolean }) => Promise<{ ok: boolean }>;
  setQuitConfirmationPreference?: (skipPrompt: boolean) => Promise<{ ok: boolean }>;
};

function getQuitUiBridge(): QuitUiBridge | null {
  if (!isElectron) return null;
  if (typeof window === "undefined") return null;
  const ui = window.cmux?.ui;
  if (
    !ui ||
    typeof ui.getQuitConfirmationPreference !== "function" ||
    typeof ui.confirmQuit !== "function"
  ) {
    return null;
  }
  return ui as QuitUiBridge;
}

export function QuitConfirmationDialogManager() {
  const [open, setOpen] = useState(false);
  const [rememberChoice, setRememberChoice] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const skipPromptRef = useRef(false);
  const checkboxId = useId();

  useEffect(() => {
    const bridge = getQuitUiBridge();
    if (!bridge) {
      return;
    }

    let cancelled = false;

    bridge
      .getQuitConfirmationPreference()
      .then((pref) => {
        if (cancelled) return;
        const skip = Boolean(pref?.skipPrompt);
        skipPromptRef.current = skip;
      })
      .catch((error: unknown) => {
        console.warn("Failed to load quit confirmation preference", error);
      });

    const offShortcut = window.cmux.on("shortcut:cmd-q", () => {
      if (skipPromptRef.current) {
        void bridge
          .confirmQuit({ skipPrompt: true })
          .catch((error: unknown) => {
            console.error("Failed to quit after shortcut", error);
          });
        return;
      }
      setErrorMessage(null);
      setRememberChoice(false);
      setOpen(true);
    });

    return () => {
      cancelled = true;
      offShortcut?.();
    };
  }, []);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setRememberChoice(false);
      setIsConfirming(false);
      setErrorMessage(null);
    }
  }, []);

  const handleCheckboxChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setRememberChoice(event.target.checked);
    },
    []
  );

  const handleConfirm = useCallback(async () => {
    const bridge = getQuitUiBridge();
    if (!bridge || isConfirming) return;
    setIsConfirming(true);
    setErrorMessage(null);
    try {
      skipPromptRef.current = rememberChoice;
      await bridge.confirmQuit({ skipPrompt: rememberChoice });
      setOpen(false);
    } catch (error: unknown) {
      console.error("Failed to confirm quit", error);
      setErrorMessage("We couldn’t close the app. Please try again.");
      setIsConfirming(false);
    }
  }, [isConfirming, rememberChoice]);

  if (!getQuitUiBridge()) {
    return null;
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-neutral-950/40 backdrop-blur-sm transition-opacity data-[state=closed]:opacity-0 data-[state=open]:opacity-100" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl focus:outline-none dark:border-neutral-800 dark:bg-neutral-900">
          <div className="space-y-5">
            <header>
              <Dialog.Title className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                Quit Cmux?
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                Press Quit to close the app. You can choose to always quit without
                seeing this reminder.
              </Dialog.Description>
            </header>

            <label
              htmlFor={checkboxId}
              className="flex items-start gap-3 text-sm text-neutral-700 dark:text-neutral-300"
            >
              <input
                id={checkboxId}
                type="checkbox"
                className="mt-1 size-4 rounded border border-neutral-300 text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-1 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus-visible:ring-neutral-100 dark:focus-visible:ring-offset-neutral-900"
                checked={rememberChoice}
                onChange={handleCheckboxChange}
              />
              <span className="leading-5">
                Always quit immediately when I press ⌘Q
              </span>
            </label>

            {errorMessage ? (
              <p className="text-sm text-destructive" role="alert">
                {errorMessage}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button variant="outline" disabled={isConfirming}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                variant="destructive"
                onClick={handleConfirm}
                disabled={isConfirming}
              >
                Quit
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
