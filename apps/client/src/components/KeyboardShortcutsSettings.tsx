import { Input } from "@heroui/react";
import { Keyboard } from "lucide-react";

interface KeyboardShortcutsData {
  commandPaletteMac: string;
  commandPaletteOther: string;
  sidebarToggle: string;
  taskRunNavigationMac: string;
  taskRunNavigationOther: string;
  devToolsMac: string;
  devToolsOther: string;
}

interface KeyboardShortcutsSettingsProps {
  data: KeyboardShortcutsData;
  onChange: (data: KeyboardShortcutsData) => void;
}

export function KeyboardShortcutsSettings({
  data,
  onChange,
}: KeyboardShortcutsSettingsProps) {
  const handleChange = (field: keyof KeyboardShortcutsData, value: string) => {
    onChange({
      ...data,
      [field]: value,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Keyboard className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Keyboard Shortcuts
        </h3>
      </div>

      <div className="space-y-4">
        {/* Command Palette */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Command Palette
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="commandPaletteMac"
                className="text-xs text-neutral-600 dark:text-neutral-400"
              >
                macOS
              </label>
              <Input
                id="commandPaletteMac"
                value={data.commandPaletteMac}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleChange("commandPaletteMac", e.target.value)
                }
                placeholder="Cmd+K"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="commandPaletteOther"
                className="text-xs text-neutral-600 dark:text-neutral-400"
              >
                Windows/Linux
              </label>
              <Input
                id="commandPaletteOther"
                value={data.commandPaletteOther}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleChange("commandPaletteOther", e.target.value)
                }
                placeholder="Ctrl+K"
                className="font-mono text-sm"
              />
            </div>
          </div>
        </div>

        {/* Sidebar Toggle */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Sidebar Toggle
          </p>
          <div className="space-y-1.5">
            <label
              htmlFor="sidebarToggle"
              className="text-xs text-neutral-600 dark:text-neutral-400"
            >
              All Platforms
            </label>
            <Input
              id="sidebarToggle"
              value={data.sidebarToggle}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange("sidebarToggle", e.target.value)}
              placeholder="Ctrl+Shift+S"
              className="font-mono text-sm"
            />
          </div>
        </div>

        {/* Task Run Navigation */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Task Run Navigation (modifier for 1-8)
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="taskRunNavigationMac"
                className="text-xs text-neutral-600 dark:text-neutral-400"
              >
                macOS
              </label>
              <Input
                id="taskRunNavigationMac"
                value={data.taskRunNavigationMac}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleChange("taskRunNavigationMac", e.target.value)
                }
                placeholder="Ctrl"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="taskRunNavigationOther"
                className="text-xs text-neutral-600 dark:text-neutral-400"
              >
                Windows/Linux
              </label>
              <Input
                id="taskRunNavigationOther"
                value={data.taskRunNavigationOther}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleChange("taskRunNavigationOther", e.target.value)
                }
                placeholder="Alt"
                className="font-mono text-sm"
              />
            </div>
          </div>
        </div>

        {/* DevTools Toggle */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            DevTools Toggle
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="devToolsMac"
                className="text-xs text-neutral-600 dark:text-neutral-400"
              >
                macOS
              </label>
              <Input
                id="devToolsMac"
                value={data.devToolsMac}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange("devToolsMac", e.target.value)}
                placeholder="Cmd+I"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="devToolsOther"
                className="text-xs text-neutral-600 dark:text-neutral-400"
              >
                Windows/Linux
              </label>
              <Input
                id="devToolsOther"
                value={data.devToolsOther}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange("devToolsOther", e.target.value)}
                placeholder="Ctrl+I"
                className="font-mono text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Changes will take effect after reloading the application.
      </p>
    </div>
  );
}
