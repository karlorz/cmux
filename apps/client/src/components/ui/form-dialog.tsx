import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, X } from "lucide-react";

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  submitLabel: string;
  submitIcon?: React.ReactNode;
  onSubmit: (e: React.FormEvent) => void;
  isLoading?: boolean;
  loadingLabel?: string;
  isSubmitDisabled?: boolean;
  maxWidth?: string;
  children: React.ReactNode;
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  submitIcon,
  onSubmit,
  isLoading,
  loadingLabel,
  isSubmitDisabled,
  maxWidth = "max-w-lg",
  children,
}: FormDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-global-blocking)] bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content className={`fixed left-1/2 top-1/2 z-[var(--z-global-blocking)] w-full ${maxWidth} -translate-x-1/2 -translate-y-1/2 rounded-lg border border-neutral-200 bg-white p-6 shadow-xl focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95`}>
          <Dialog.Close asChild>
            <button
              type="button"
              className="absolute right-4 top-4 rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/40 dark:hover:bg-neutral-800 dark:hover:text-white"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </Dialog.Close>

          <Dialog.Title className="text-lg font-semibold text-neutral-900 dark:text-white">
            {title}
          </Dialog.Title>

          {description && (
            <Dialog.Description className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              {description}
            </Dialog.Description>
          )}

          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            {children}

            <div className="mt-6 flex justify-end gap-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={isLoading || isSubmitDisabled}
                className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    {loadingLabel ?? submitLabel}
                  </>
                ) : (
                  <>
                    {submitIcon && <span className="mr-2">{submitIcon}</span>}
                    {submitLabel}
                  </>
                )}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
