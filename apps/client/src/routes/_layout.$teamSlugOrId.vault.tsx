/**
 * Vault Page
 *
 * Displays vault notes sorted by agent access time.
 * Provides visibility into which knowledge base notes agents are referencing.
 */

import { FloatingPane } from "@/components/floating-pane";
import { TitleBar } from "@/components/TitleBar";
import { VaultNoteList } from "@/components/vault/VaultNoteList";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Settings } from "lucide-react";

export const Route = createFileRoute("/_layout/$teamSlugOrId/vault")({
  component: VaultPage,
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
      <VaultNoteList teamSlugOrId={teamSlugOrId} />
    </FloatingPane>
  );
}
