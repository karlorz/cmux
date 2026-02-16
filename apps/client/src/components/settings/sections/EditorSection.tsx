import { EditorSettingsSection } from "@/components/EditorSettingsSection";

interface EditorSectionProps {
  teamSlugOrId: string;
}

export function EditorSection({ teamSlugOrId }: EditorSectionProps) {
  return <EditorSettingsSection teamSlugOrId={teamSlugOrId} />;
}
