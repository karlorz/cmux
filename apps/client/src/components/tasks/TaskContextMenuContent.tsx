import { ContextMenu } from "@base-ui-components/react/context-menu";
import {
  Archive,
  ArchiveRestore,
  Copy,
  Pencil,
} from "lucide-react";
import type { ReactNode } from "react";

const MENU_ITEM_CLASS =
  "flex items-center gap-2 cursor-default py-1.5 pr-8 pl-3 text-[13px] leading-5 outline-none select-none data-[highlighted]:relative data-[highlighted]:z-0 data-[highlighted]:text-white data-[highlighted]:before:absolute data-[highlighted]:before:inset-x-1 data-[highlighted]:before:inset-y-0 data-[highlighted]:before:z-[-1] data-[highlighted]:before:rounded-sm data-[highlighted]:before:bg-neutral-900 dark:data-[highlighted]:before:bg-neutral-700";

const SEPARATOR_CLASS = "my-1 h-px bg-neutral-200 dark:bg-neutral-700";

interface TaskContextMenuContentProps {
  canRename?: boolean;
  onRename?: () => void;
  onCopyDescription?: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  isArchived: boolean;
  children?: ReactNode;
}

export function TaskContextMenuContent({
  canRename,
  onRename,
  onCopyDescription,
  onArchive,
  onUnarchive,
  isArchived,
  children,
}: TaskContextMenuContentProps) {
  return (
    <>
      {canRename && onRename ? (
        <>
          <ContextMenu.Item className={MENU_ITEM_CLASS} onClick={onRename}>
            <Pencil className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-300" />
            <span>Rename Task</span>
          </ContextMenu.Item>
          <div className={SEPARATOR_CLASS} />
        </>
      ) : null}

      {onCopyDescription ? (
        <ContextMenu.Item
          className={MENU_ITEM_CLASS}
          onClick={onCopyDescription}
        >
          <Copy className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-300" />
          <span>Copy Description</span>
        </ContextMenu.Item>
      ) : null}

      {children}

      {isArchived ? (
        <ContextMenu.Item className={MENU_ITEM_CLASS} onClick={onUnarchive}>
          <ArchiveRestore className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-300" />
          <span>Unarchive Task</span>
        </ContextMenu.Item>
      ) : (
        <ContextMenu.Item className={MENU_ITEM_CLASS} onClick={onArchive}>
          <Archive className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-300" />
          <span>Archive Task</span>
        </ContextMenu.Item>
      )}
    </>
  );
}
