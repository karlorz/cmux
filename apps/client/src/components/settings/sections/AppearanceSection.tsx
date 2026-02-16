import { SettingSection } from "@/components/settings/SettingSection";
import { SettingSegmented } from "@/components/settings/SettingSegmented";

type ThemeValue = "light" | "dark" | "system";

interface AppearanceSectionProps {
  resolvedTheme: ThemeValue;
  onThemeChange: (theme: ThemeValue) => void;
}

export function AppearanceSection({
  resolvedTheme,
  onThemeChange,
}: AppearanceSectionProps) {
  return (
    <SettingSection title="Appearance">
      <SettingSegmented
        label="Theme"
        description="Choose how cmux should look."
        value={resolvedTheme}
        onChange={(value) => onThemeChange(value as ThemeValue)}
        options={[
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
          { value: "system", label: "System" },
        ]}
        noBorder
      />
    </SettingSection>
  );
}
