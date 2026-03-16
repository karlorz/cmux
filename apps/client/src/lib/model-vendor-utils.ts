/**
 * Shared utilities for grouping and displaying models by vendor.
 *
 * Extracted from duplicated logic in:
 * - DashboardInputControls.tsx
 * - ModelCatalogSection.tsx
 * - ModelManagementSection.tsx
 * - OrchestrationSpawnDialog.tsx
 */

import type { AgentVendor } from "@cmux/shared/agent-catalog";

/**
 * Display names for each vendor (used in headers/labels).
 */
export const VENDOR_DISPLAY_NAMES: Record<AgentVendor | "other", string> = {
  anthropic: "Claude",
  openai: "OpenAI / Codex",
  google: "Gemini",
  opencode: "OpenCode",
  qwen: "Qwen",
  cursor: "Cursor",
  amp: "Amp",
  xai: "xAI",
  openrouter: "OpenRouter",
  other: "Other",
};

/**
 * Canonical vendor display order. Lower number = higher priority.
 * Matches the order in AGENT_CATALOG: anthropic first, then openai, etc.
 */
export const VENDOR_DISPLAY_ORDER: Record<AgentVendor | "other", number> = {
  anthropic: 0,
  openai: 1,
  amp: 2,
  opencode: 3,
  google: 4,
  qwen: 5,
  cursor: 6,
  xai: 7,
  openrouter: 8,
  other: 99,
};

/**
 * Get the display order for a vendor. Unknown vendors get order 99.
 */
export function getVendorOrder(vendor: string): number {
  return VENDOR_DISPLAY_ORDER[vendor as AgentVendor] ?? 99;
}

/**
 * Get the display name for a vendor. Unknown vendors return the vendor string capitalized.
 */
export function getVendorDisplayName(vendor: string): string {
  return (
    VENDOR_DISPLAY_NAMES[vendor as AgentVendor | "other"] ??
    vendor.charAt(0).toUpperCase() + vendor.slice(1)
  );
}

/**
 * Generic model shape for grouping. Any object with a vendor field works.
 */
export interface HasVendor {
  vendor: string;
}

interface HasVendorAndSortOrder extends HasVendor {
  sortOrder?: number;
}

/**
 * Group models by vendor, preserving the order of models within each vendor.
 * Returns a Map with vendors as keys, ordered by the minimum sortOrder of
 * models within each vendor (respects cross-vendor reordering).
 *
 * @param models Array of models with vendor and optional sortOrder fields
 * @returns Map of vendor -> models[], ordered by minimum sortOrder per vendor
 */
export function groupModelsByVendor<T extends HasVendorAndSortOrder>(
  models: T[]
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const model of models) {
    const vendor = model.vendor || "other";
    const existing = grouped.get(vendor);
    if (existing) {
      existing.push(model);
    } else {
      grouped.set(vendor, [model]);
    }
  }

  // Sort vendor groups by minimum sortOrder of models within each group
  // This respects cross-vendor reordering (e.g., if an admin moves a model
  // from vendor B to position 1, vendor B's group should appear first)
  const getMinSortOrder = (models: T[]): number => {
    return Math.min(...models.map((m) => m.sortOrder ?? Infinity));
  };

  const sorted = new Map(
    [...grouped.entries()].sort(
      ([, modelsA], [, modelsB]) => getMinSortOrder(modelsA) - getMinSortOrder(modelsB)
    )
  );

  return sorted;
}

/**
 * Sort models by vendor first (using display order), then by a secondary key.
 *
 * @param models Array of models with a vendor field
 * @param secondaryKey Function to extract the secondary sort key (lower = first)
 * @returns Sorted array of models
 */
export function sortModelsByVendor<T extends HasVendor>(
  models: T[],
  secondaryKey: (model: T) => number = () => 0
): T[] {
  return [...models].sort((a, b) => {
    const vendorDiff = getVendorOrder(a.vendor) - getVendorOrder(b.vendor);
    if (vendorDiff !== 0) return vendorDiff;
    return secondaryKey(a) - secondaryKey(b);
  });
}
