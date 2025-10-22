import LexicalEditor from "@/components/lexical/LexicalEditor";
import { ContextMenu } from "@base-ui-components/react/context-menu";
import clsx from "clsx";
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { ClipboardCopy, ClipboardPaste, Redo2, Scissors, TextSelect, Undo2 } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@cmux/convex/dataModel";

const CONTEXT_MENU_ITEM_CLASS =
  "flex items-center gap-2 cursor-default py-1.5 pr-8 pl-3 text-[13px] leading-5 outline-none select-none data-[highlighted]:relative data-[highlighted]:z-0 data-[highlighted]:text-white data-[highlighted]:before:absolute data-[highlighted]:before:inset-x-1 data-[highlighted]:before:inset-y-0 data-[highlighted]:before:z-[-1] data-[highlighted]:before:rounded-sm data-[highlighted]:before:bg-neutral-900 dark:data-[highlighted]:before:bg-neutral-700";
const CONTEXT_MENU_POPUP_CLASS =
  "origin-[var(--transform-origin)] rounded-md bg-white dark:bg-neutral-800 py-1 text-neutral-900 dark:text-neutral-100 shadow-lg shadow-gray-200 outline-1 outline-neutral-200 transition-[opacity] data-[ending-style]:opacity-0 dark:shadow-none dark:-outline-offset-1 dark:outline-neutral-700";
const CONTEXT_MENU_SEPARATOR_CLASS =
  "my-1 mx-1 h-px bg-neutral-200 dark:bg-neutral-700";
const CONTEXT_MENU_ICON_CLASS =
  "w-3.5 h-3.5 text-neutral-600 dark:text-neutral-300";

export interface EditorApi {
  getContent: () => {
    text: string;
    images: Array<{
      src: string;
      fileName?: string;
      altText: string;
    }>;
  };
  clear: () => void;
  focus?: () => void;
  insertText?: (text: string) => void;
}

interface DashboardInputProps {
  onTaskDescriptionChange: (value: string) => void;
  onSubmit: () => void;
  repoUrl?: string;
  branch?: string;
  environmentId?: Id<"environments">;
  persistenceKey?: string;
  maxHeight?: string;
}

export const DashboardInput = memo(
  forwardRef<EditorApi, DashboardInputProps>(function DashboardInput(
    {
      onTaskDescriptionChange,
      onSubmit,
      repoUrl,
      branch,
      environmentId,
      persistenceKey,
      maxHeight = "600px",
    },
    ref
  ) {
    const internalApiRef = useRef<EditorApi | null>(null);
    const lastPointerEventRef = useRef<{
      ts: number;
      target: EventTarget | null;
    }>({
      ts: 0,
      target: null,
    });
    const lastKeydownRef = useRef<{
      ts: number;
      key: string;
      code: string;
      metaKey: boolean;
      ctrlKey: boolean;
      altKey: boolean;
    }>({
      ts: 0,
      key: "",
      code: "",
      metaKey: false,
      ctrlKey: false,
      altKey: false,
    });
    const pendingRefocusTimeoutRef = useRef<number | null>(null);
    const triggerRef = useRef<HTMLDivElement | null>(null);

    useImperativeHandle(ref, () => ({
      getContent: () =>
        internalApiRef.current?.getContent() || { text: "", images: [] },
      clear: () => internalApiRef.current?.clear(),
      focus: () => internalApiRef.current?.focus?.(),
      insertText: (text: string) => internalApiRef.current?.insertText?.(text),
    }));

    useEffect(() => {
      const lexicalRootSelector = ".dashboard-input-editor";
      // const isDev = import.meta.env.DEV;
      const isDev = false;

      const clearPendingRefocus = () => {
        if (pendingRefocusTimeoutRef.current !== null) {
          window.clearTimeout(pendingRefocusTimeoutRef.current);
          pendingRefocusTimeoutRef.current = null;
        }
      };

      const describeElement = (target: EventTarget | null) => {
        if (!(target instanceof Element)) {
          return target ? String(target) : "<null>";
        }

        const id = target.id ? `#${target.id}` : "";
        const className = target.className
          ? `.${target.className.toString().trim().replace(/\s+/g, ".")}`
          : "";
        const title =
          target instanceof HTMLIFrameElement && target.title
            ? `(${target.title})`
            : "";

        return `${target.tagName.toLowerCase()}${id}${className}${title}`;
      };

      const scheduleRefocus = () => {
        clearPendingRefocus();
        pendingRefocusTimeoutRef.current = window.setTimeout(() => {
          pendingRefocusTimeoutRef.current = null;
          internalApiRef.current?.focus?.();
        }, 0);
      };

      const shouldRestoreFocus = (
        event: FocusEvent,
        candidateActiveElement: Element | null
      ) => {
        if (!document.hasFocus()) {
          return false;
        }

        const targetElement =
          event.target instanceof Element ? event.target : null;
        if (!targetElement?.closest(lexicalRootSelector)) {
          return false;
        }

        if (
          candidateActiveElement &&
          targetElement.contains(candidateActiveElement)
        ) {
          return false;
        }

        const now = Date.now();
        const recentPointer = lastPointerEventRef.current;
        if (
          recentPointer.ts !== 0 &&
          now - recentPointer.ts < 400 &&
          recentPointer.target instanceof Element &&
          !recentPointer.target.closest(lexicalRootSelector)
        ) {
          return false;
        }

        const recentKeydown = lastKeydownRef.current;
        if (
          recentKeydown.ts !== 0 &&
          now - recentKeydown.ts < 400 &&
          (recentKeydown.key === "Tab" || recentKeydown.code === "Tab")
        ) {
          return false;
        }

        if (!candidateActiveElement) {
          return true;
        }

        if (
          candidateActiveElement instanceof HTMLIFrameElement &&
          candidateActiveElement.title.toLowerCase().includes("vscode")
        ) {
          return true;
        }

        return candidateActiveElement.tagName === "BODY";
      };

      const handleFocusEvent = (event: FocusEvent) => {
        const activeElement = document.activeElement;
        const shouldRefocusImmediately =
          event.type === "focusout" &&
          shouldRestoreFocus(
            event,
            activeElement instanceof Element ? activeElement : null
          );

        if (isDev) {
          const payload = {
            eventTarget: describeElement(event.target),
            relatedTarget: describeElement(event.relatedTarget),
            activeElement: describeElement(activeElement),
            timestamp: new Date().toISOString(),
            hasDocumentFocus: document.hasFocus(),
          };
          console.log("[DashboardInput] focus event", event.type, payload);
          if (event.type === "focusout") {
            console.trace("[DashboardInput] focusout stack trace");
          }
        }

        if (shouldRefocusImmediately) {
          scheduleRefocus();
        }

        queueMicrotask(() => {
          const elementAfterMicrotask = document.activeElement;
          const shouldRefocusAfterMicrotask =
            event.type === "focusout" &&
            shouldRestoreFocus(
              event,
              elementAfterMicrotask instanceof Element
                ? elementAfterMicrotask
                : null
            );

          if (isDev) {
            console.log(
              "[DashboardInput] activeElement after microtask",
              event.type,
              {
                activeElement: describeElement(elementAfterMicrotask),
                timestamp: new Date().toISOString(),
                hasDocumentFocus: document.hasFocus(),
              }
            );
          }

          if (shouldRefocusAfterMicrotask) {
            scheduleRefocus();
          }
        });
      };

      const handlePointerEvent = (event: PointerEvent) => {
        lastPointerEventRef.current = {
          ts: Date.now(),
          target: event.target,
        };

        if (isDev) {
          console.log("[DashboardInput] pointer event", event.type, {
            eventTarget: describeElement(event.target),
            pointerType: event.pointerType,
            buttons: event.buttons,
            clientX: event.clientX,
            clientY: event.clientY,
            activeElement: describeElement(document.activeElement),
            timestamp: new Date().toISOString(),
          });
        }
      };

      const handleKeyEvent = (event: KeyboardEvent) => {
        if (event.type === "keydown") {
          lastKeydownRef.current = {
            ts: Date.now(),
            key: event.key,
            code: event.code,
            metaKey: event.metaKey,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
          };
        }

        if (isDev) {
          console.log("[DashboardInput] keyboard event", event.type, {
            key: event.key,
            code: event.code,
            metaKey: event.metaKey,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            eventTarget: describeElement(event.target),
            activeElement: describeElement(document.activeElement),
            timestamp: new Date().toISOString(),
          });
        }
      };

      document.addEventListener("focusin", handleFocusEvent, true);
      document.addEventListener("focusout", handleFocusEvent, true);
      document.addEventListener("pointerdown", handlePointerEvent, true);
      document.addEventListener("pointerup", handlePointerEvent, true);
      document.addEventListener("keydown", handleKeyEvent, true);
      document.addEventListener("keyup", handleKeyEvent, true);

      return () => {
        clearPendingRefocus();
        document.removeEventListener("focusin", handleFocusEvent, true);
        document.removeEventListener("focusout", handleFocusEvent, true);
        document.removeEventListener("pointerdown", handlePointerEvent, true);
        document.removeEventListener("pointerup", handlePointerEvent, true);
        document.removeEventListener("keydown", handleKeyEvent, true);
        document.removeEventListener("keyup", handleKeyEvent, true);
      };
    }, []);

    const focusEditor = useCallback(() => {
      internalApiRef.current?.focus?.();
    }, []);

    const runDocumentCommand = useCallback((command: string) => {
      if (typeof document === "undefined") {
        return false;
      }

      try {
        return document.execCommand(command);
      } catch (error) {
        console.error(`[DashboardInput] Failed to execute document command: ${command}`, error);
        return false;
      }
    }, []);

    const selectAllWithinEditor = useCallback(() => {
      if (typeof window === "undefined") {
        return false;
      }

      const rootElement = triggerRef.current;
      if (!rootElement) {
        return false;
      }

      const editorElement = rootElement.querySelector("[data-cmux-input=\"true\"]");
      if (!(editorElement instanceof HTMLElement)) {
        return false;
      }

      const selection = window.getSelection();
      if (!selection) {
        return false;
      }

      const range = document.createRange();
      range.selectNodeContents(editorElement);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }, []);

    const handleUndo = useCallback(() => {
      focusEditor();
      runDocumentCommand("undo");
    }, [focusEditor, runDocumentCommand]);

    const handleRedo = useCallback(() => {
      focusEditor();
      runDocumentCommand("redo");
    }, [focusEditor, runDocumentCommand]);

    const handleCut = useCallback(() => {
      focusEditor();
      runDocumentCommand("cut");
    }, [focusEditor, runDocumentCommand]);

    const handleCopy = useCallback(() => {
      focusEditor();
      runDocumentCommand("copy");
    }, [focusEditor, runDocumentCommand]);

    const handlePaste = useCallback(() => {
      focusEditor();

      const executed = runDocumentCommand("paste");
      if (executed) {
        return;
      }

      if (
        typeof navigator === "undefined" ||
        typeof navigator.clipboard?.readText !== "function"
      ) {
        toast.error("Clipboard access is unavailable. Use the keyboard shortcut to paste.");
        return;
      }

      void navigator.clipboard
        .readText()
        .then((text) => {
          if (!text) {
            return;
          }

          const editor = internalApiRef.current;
          editor?.focus?.();
          editor?.insertText?.(text);
        })
        .catch((error) => {
          console.error("[DashboardInput] Failed to read clipboard contents", error);
          toast.error("Unable to read from the clipboard.");
        });
    }, [focusEditor, runDocumentCommand]);

    const handleSelectAll = useCallback(() => {
      focusEditor();
      if (!runDocumentCommand("selectAll")) {
        selectAllWithinEditor();
      }
    }, [focusEditor, runDocumentCommand, selectAllWithinEditor]);

    const lexicalPlaceholder = useMemo(() => "Describe a task", []);

    const lexicalPadding = useMemo(
      () => ({
        paddingLeft: "14px",
        paddingRight: "16px",
        paddingTop: "14px",
      }),
      []
    );

    const lexicalClassName = useMemo(
      () =>
        clsx(
          "text-[15px] text-neutral-900 dark:text-neutral-100 min-h-[60px]! dashboard-input-editor",
          "focus:outline-none"
        ),
      []
    );

    const handleEditorReady = (api: EditorApi) => {
      internalApiRef.current = api;
    };

    return (
      <ContextMenu.Root>
        <ContextMenu.Trigger ref={triggerRef} className="w-full">
          <LexicalEditor
            placeholder={lexicalPlaceholder}
            onChange={onTaskDescriptionChange}
            onSubmit={onSubmit}
            repoUrl={repoUrl}
            branch={branch}
            environmentId={environmentId}
            persistenceKey={persistenceKey}
            padding={lexicalPadding}
            contentEditableClassName={lexicalClassName}
            maxHeight={maxHeight}
            onEditorReady={handleEditorReady}
          />
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Positioner className="outline-none z-[var(--z-context-menu)]">
            <ContextMenu.Popup className={CONTEXT_MENU_POPUP_CLASS}>
              <ContextMenu.Item
                className={CONTEXT_MENU_ITEM_CLASS}
                onClick={handleUndo}
              >
                <Undo2 className={CONTEXT_MENU_ICON_CLASS} />
                <span>Undo</span>
              </ContextMenu.Item>
              <ContextMenu.Item
                className={CONTEXT_MENU_ITEM_CLASS}
                onClick={handleRedo}
              >
                <Redo2 className={CONTEXT_MENU_ICON_CLASS} />
                <span>Redo</span>
              </ContextMenu.Item>
              <ContextMenu.Separator className={CONTEXT_MENU_SEPARATOR_CLASS} />
              <ContextMenu.Item
                className={CONTEXT_MENU_ITEM_CLASS}
                onClick={handleCut}
              >
                <Scissors className={CONTEXT_MENU_ICON_CLASS} />
                <span>Cut</span>
              </ContextMenu.Item>
              <ContextMenu.Item
                className={CONTEXT_MENU_ITEM_CLASS}
                onClick={handleCopy}
              >
                <ClipboardCopy className={CONTEXT_MENU_ICON_CLASS} />
                <span>Copy</span>
              </ContextMenu.Item>
              <ContextMenu.Item
                className={CONTEXT_MENU_ITEM_CLASS}
                onClick={handlePaste}
              >
                <ClipboardPaste className={CONTEXT_MENU_ICON_CLASS} />
                <span>Paste</span>
              </ContextMenu.Item>
              <ContextMenu.Separator className={CONTEXT_MENU_SEPARATOR_CLASS} />
              <ContextMenu.Item
                className={CONTEXT_MENU_ITEM_CLASS}
                onClick={handleSelectAll}
              >
                <TextSelect className={CONTEXT_MENU_ICON_CLASS} />
                <span>Select All</span>
              </ContextMenu.Item>
            </ContextMenu.Popup>
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    );
  })
);
