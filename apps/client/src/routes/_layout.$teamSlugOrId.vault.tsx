/**
 * Vault Page
 *
 * Displays vault notes sorted by agent access time.
 * Provides visibility into which knowledge base notes agents are referencing.
 */

import { FloatingPane } from "@/components/floating-pane";
import { TitleBar } from "@/components/TitleBar";
import { VaultNoteList } from "@/components/vault/VaultNoteList";
import { VaultNotePreview } from "@/components/vault/VaultNotePreview";
import {
  getInitialVaultNoteListVisibility,
  persistVaultNoteListVisibility,
  readStoredVaultNoteListVisibility,
} from "@/components/vault/vault-note-list-visibility";
import { api } from "@cmux/convex/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { z } from "zod";

const DEFAULT_VAULT_NAME = "obsidian_vault";

export const Route = createFileRoute("/_layout/$teamSlugOrId/vault")({
  component: VaultPage,
  validateSearch: z.object({
    notePath: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { title: "Vault | cmux" },
      {
        name: "description",
        content: "View which knowledge base notes your AI agents are accessing",
      },
    ],
  }),
});

function VaultPage() {
  const { teamSlugOrId } = Route.useParams();
  const { notePath } = Route.useSearch();
  const navigate = Route.useNavigate();
  const workspaceSettings = useQuery(api.workspaceSettings.get, { teamSlugOrId });
  const vaultName = workspaceSettings?.vaultConfig?.vaultName ?? DEFAULT_VAULT_NAME;
  const [isNoteListVisible, setIsNoteListVisible] = useState(() =>
    getInitialVaultNoteListVisibility({
      teamSlugOrId,
      notePath,
    })
  );

  useEffect(() => {
    if (!notePath) {
      setIsNoteListVisible(true);
    }
  }, [notePath]);

  const handleSelectedNotePathChange = useCallback(
    (nextNotePath?: string) => {
      setIsNoteListVisible(
        nextNotePath
          ? readStoredVaultNoteListVisibility(teamSlugOrId) ?? false
          : true
      );
      void navigate({
        to: "/$teamSlugOrId/vault",
        params: { teamSlugOrId },
        search: { notePath: nextNotePath || undefined },
      });
    },
    [navigate, teamSlugOrId]
  );

  const handleToggleNoteList = useCallback(() => {
    setIsNoteListVisible((previous) => {
      const nextVisibility = !previous;
      persistVaultNoteListVisibility(teamSlugOrId, nextVisibility);
      return nextVisibility;
    });
  }, [teamSlugOrId]);

  return (
    <FloatingPane
      header={
        <TitleBar
          title="Vault"
          actions={
            <Link
              to="/$teamSlugOrId/settings"
              params={{ teamSlugOrId }}
              search={{ section: "general" }}
              className="flex items-center gap-1.5 px-2 py-1 text-xs text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="Configure vault settings"
            >
              <Settings className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Settings</span>
            </Link>
          }
        />
      }
    >
      <div className="flex h-full min-h-0 flex-col lg:flex-row">
        {isNoteListVisible ? (
          <div className="flex min-h-0 min-w-0 flex-col border-b border-neutral-200 dark:border-neutral-800 lg:w-[24rem] lg:flex-none lg:border-b-0 lg:border-r xl:w-[28rem]">
            <VaultNoteList
              teamSlugOrId={teamSlugOrId}
              vaultName={vaultName}
              selectedNotePath={notePath}
              onSelectedNotePathChange={handleSelectedNotePathChange}
              showInlinePreview={false}
            />
          </div>
        ) : null}
        <div className="min-h-0 min-w-0 flex-1">
          <VaultNotePreview
            teamSlugOrId={teamSlugOrId}
            vaultName={vaultName}
            notePath={notePath}
            onSelectedNotePathChange={handleSelectedNotePathChange}
            isNoteListVisible={isNoteListVisible}
            onToggleNoteList={handleToggleNoteList}
          />
        </div>
      </div>
    </FloatingPane>
  );
}
