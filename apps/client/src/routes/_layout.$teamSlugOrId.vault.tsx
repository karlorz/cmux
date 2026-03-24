/**
 * Vault Page
 *
 * Displays vault notes sorted by agent access time.
 * Provides visibility into which knowledge base notes agents are referencing.
 */

import { FloatingPane } from "@/components/floating-pane";
import { TitleBar } from "@/components/TitleBar";
import { VaultNoteList } from "@/components/vault/VaultNoteList";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_layout/$teamSlugOrId/vault")({
  component: VaultPage,
});

function VaultPage() {
  const { teamSlugOrId } = Route.useParams();

  return (
    <FloatingPane header={<TitleBar title="Vault" />}>
      <VaultNoteList teamSlugOrId={teamSlugOrId} />
    </FloatingPane>
  );
}
