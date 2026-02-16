import { SettingRow } from "@/components/settings/SettingRow";
import { SettingSection } from "@/components/settings/SettingSection";
import { SettingSelect } from "@/components/settings/SettingSelect";

export type HeatmapColors = {
  line: { start: string; end: string };
  token: { start: string; end: string };
};

interface Option {
  value: string;
  label: string;
}

interface HeatmapSectionProps {
  heatmapModel: string;
  onHeatmapModelChange: (value: string) => void;
  heatmapModelOptions: Option[];
  heatmapTooltipLanguage: string;
  onHeatmapTooltipLanguageChange: (value: string) => void;
  tooltipLanguageOptions: Option[];
  heatmapThreshold: number;
  onHeatmapThresholdChange: (value: number) => void;
  heatmapColors: HeatmapColors;
  onHeatmapColorsChange: (value: HeatmapColors) => void;
}

export function HeatmapSection({
  heatmapModel,
  onHeatmapModelChange,
  heatmapModelOptions,
  heatmapTooltipLanguage,
  onHeatmapTooltipLanguageChange,
  tooltipLanguageOptions,
  heatmapThreshold,
  onHeatmapThresholdChange,
  heatmapColors,
  onHeatmapColorsChange,
}: HeatmapSectionProps) {
  return (
    <SettingSection title="Diff Heatmap Review">
      <SettingSelect
        id="heatmapModel"
        label="Review Model"
        description="Select the model used to analyze diffs and highlight areas that need attention."
        value={heatmapModel}
        options={heatmapModelOptions}
        onChange={onHeatmapModelChange}
      />

      <SettingSelect
        id="heatmapTooltipLanguage"
        label="Tooltip Language"
        description="Language for the review comments shown in heatmap tooltips."
        value={heatmapTooltipLanguage}
        options={tooltipLanguageOptions}
        onChange={onHeatmapTooltipLanguageChange}
      />

      <SettingRow
        label={`Visibility Threshold: ${Math.round(heatmapThreshold * 100)}%`}
        description="Only show highlights for lines with a review score above this threshold."
      >
        <input
          type="range"
          id="heatmapThreshold"
          min="0"
          max="1"
          step="0.05"
          value={heatmapThreshold}
          onChange={(e) =>
            onHeatmapThresholdChange(Number.parseFloat(e.target.value))
          }
          className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
        />
      </SettingRow>

      <SettingRow
        label="Heatmap Colors"
        description="Customize the gradient colors for line and token highlighting."
        noBorder
      >
        <div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Line Background
              </span>
              <div className="flex items-center gap-2">
                <label className="w-10 text-xs text-neutral-500 dark:text-neutral-400">
                  Low
                </label>
                <input
                  type="color"
                  value={heatmapColors.line.start}
                  onChange={(e) =>
                    onHeatmapColorsChange({
                      ...heatmapColors,
                      line: { ...heatmapColors.line, start: e.target.value },
                    })
                  }
                  className="w-8 h-8 rounded border border-neutral-300 dark:border-neutral-600 cursor-pointer"
                />
                <span className="text-xs font-mono text-neutral-500">
                  {heatmapColors.line.start}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <label className="w-10 text-xs text-neutral-500 dark:text-neutral-400">
                  High
                </label>
                <input
                  type="color"
                  value={heatmapColors.line.end}
                  onChange={(e) =>
                    onHeatmapColorsChange({
                      ...heatmapColors,
                      line: { ...heatmapColors.line, end: e.target.value },
                    })
                  }
                  className="w-8 h-8 rounded border border-neutral-300 dark:border-neutral-600 cursor-pointer"
                />
                <span className="text-xs font-mono text-neutral-500">
                  {heatmapColors.line.end}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Token Highlight
              </span>
              <div className="flex items-center gap-2">
                <label className="w-10 text-xs text-neutral-500 dark:text-neutral-400">
                  Low
                </label>
                <input
                  type="color"
                  value={heatmapColors.token.start}
                  onChange={(e) =>
                    onHeatmapColorsChange({
                      ...heatmapColors,
                      token: { ...heatmapColors.token, start: e.target.value },
                    })
                  }
                  className="w-8 h-8 rounded border border-neutral-300 dark:border-neutral-600 cursor-pointer"
                />
                <span className="text-xs font-mono text-neutral-500">
                  {heatmapColors.token.start}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <label className="w-10 text-xs text-neutral-500 dark:text-neutral-400">
                  High
                </label>
                <input
                  type="color"
                  value={heatmapColors.token.end}
                  onChange={(e) =>
                    onHeatmapColorsChange({
                      ...heatmapColors,
                      token: { ...heatmapColors.token, end: e.target.value },
                    })
                  }
                  className="w-8 h-8 rounded border border-neutral-300 dark:border-neutral-600 cursor-pointer"
                />
                <span className="text-xs font-mono text-neutral-500">
                  {heatmapColors.token.end}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              Preview
            </span>
            <div
              className="mt-1 h-4 rounded"
              style={{
                background: `linear-gradient(to right, ${heatmapColors.line.start}, ${heatmapColors.line.end})`,
              }}
            />
          </div>
        </div>
      </SettingRow>
    </SettingSection>
  );
}
