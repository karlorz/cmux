import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import path from "node:path";

import { app } from "electron";

import {
  bindingsEqual,
  buildEffectiveBindings,
  getDefaultBinding,
  normalizeBinding,
  type GlobalShortcutAction,
  type ShortcutBinding,
  type ShortcutConfig,
} from "../../src/lib/global-shortcuts";

type PersistedShortcutConfig = {
  version: number;
  overrides: Partial<Record<GlobalShortcutAction, ShortcutBinding>>;
};

type ShortcutChangePayload = {
  overrides: Partial<Record<GlobalShortcutAction, ShortcutBinding>>;
  effective: Record<GlobalShortcutAction, ShortcutBinding>;
};

const CONFIG_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function sanitizeBinding(raw: unknown): ShortcutBinding | null {
  if (!isRecord(raw)) return null;
  const key = raw["key"];
  if (typeof key !== "string" || key.length === 0) return null;
  const code = raw["code"];
  const meta = raw["meta"];
  const ctrl = raw["ctrl"];
  const alt = raw["alt"];
  const shift = raw["shift"];
  return normalizeBinding({
    key,
    code: typeof code === "string" ? code : null,
    meta: typeof meta === "boolean" ? meta : Boolean(meta),
    ctrl: typeof ctrl === "boolean" ? ctrl : Boolean(ctrl),
    alt: typeof alt === "boolean" ? alt : Boolean(alt),
    shift: typeof shift === "boolean" ? shift : Boolean(shift),
  });
}

export class GlobalShortcutStore extends EventEmitter {
  private loaded = false;
  private config: ShortcutConfig = { overrides: {} };
  private effective = buildEffectiveBindings(this.config);
  private readonly platform: NodeJS.Platform =
    (process.platform as NodeJS.Platform) ?? "linux";
  private filePath: string | null = null;
  private log: (msg: string, meta?: unknown) => void = () => {};
  private warn: (msg: string, meta?: unknown) => void = () => {};

  setLogger(logger: {
    log?: (msg: string, meta?: unknown) => void;
    warn?: (msg: string, meta?: unknown) => void;
  }): void {
    if (logger.log) this.log = logger.log.bind(logger);
    if (logger.warn) this.warn = logger.warn.bind(logger);
  }

  private resolveFilePath(): string {
    if (this.filePath) return this.filePath;
    const base = path.join(app.getPath("userData"), "settings");
    this.filePath = path.join(base, "global-shortcuts.json");
    return this.filePath;
  }

  async init(): Promise<void> {
    if (this.loaded) return;
    await this.loadFromDisk();
    this.loaded = true;
  }

  private async loadFromDisk(): Promise<void> {
    try {
      const file = this.resolveFilePath();
      const json = await fs.readFile(file, "utf8");
      const parsed = JSON.parse(json) as PersistedShortcutConfig;
      const overrides: ShortcutConfig["overrides"] = {};
      if (isRecord(parsed) && isRecord(parsed.overrides)) {
        for (const entry of Object.entries(parsed.overrides)) {
          const action = entry[0] as GlobalShortcutAction;
          const binding = sanitizeBinding(entry[1]);
          if (!binding) continue;
          try {
            getDefaultBinding(action);
            overrides[action] = binding;
          } catch {
            this.warn("Ignoring shortcut override for unknown action", {
              action,
            });
          }
        }
      }
      this.config = { overrides };
      this.recomputeEffective();
    } catch (error: unknown) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        this.config = { overrides: {} };
        this.recomputeEffective();
        return;
      }
      this.warn("Failed to load shortcut config from disk", error);
      this.config = { overrides: {} };
      this.recomputeEffective();
    }
  }

  private async writeToDisk(): Promise<void> {
    try {
      const file = this.resolveFilePath();
      await fs.mkdir(path.dirname(file), { recursive: true });
      const data: PersistedShortcutConfig = {
        version: CONFIG_VERSION,
        overrides: this.config.overrides,
      };
      await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
    } catch (error) {
      this.warn("Failed to persist shortcut config", error);
    }
  }

  private recomputeEffective(): void {
    this.effective = buildEffectiveBindings(this.config, this.platform);
  }

  getEffectiveBindings(): Record<GlobalShortcutAction, ShortcutBinding> {
    return this.effective;
  }

  getBinding(action: GlobalShortcutAction): ShortcutBinding {
    const binding = this.effective[action];
    if (!binding) {
      return getDefaultBinding(action, this.platform);
    }
    return binding;
  }

  getOverrides(): Partial<Record<GlobalShortcutAction, ShortcutBinding>> {
    return { ...this.config.overrides };
  }

  async setBinding(
    action: GlobalShortcutAction,
    binding: ShortcutBinding | null
  ): Promise<void> {
    await this.init();
    const defaultBinding = getDefaultBinding(action, this.platform);
    const overrides = { ...this.config.overrides };

    if (!binding || bindingsEqual(binding, defaultBinding)) {
      if (overrides[action]) {
        delete overrides[action];
      } else {
        return;
      }
    } else {
      overrides[action] = normalizeBinding(binding);
    }

    this.config = { overrides };
    this.recomputeEffective();
    await this.writeToDisk();
    this.emitChange();
  }

  async resetAll(): Promise<void> {
    await this.init();
    if (Object.keys(this.config.overrides).length === 0) return;
    this.config = { overrides: {} };
    this.recomputeEffective();
    await this.writeToDisk();
    this.emitChange();
  }

  private emitChange(): void {
    const payload: ShortcutChangePayload = {
      overrides: this.getOverrides(),
      effective: this.getEffectiveBindings(),
    };
    this.emit("change", payload);
  }

  onChange(
    listener: (payload: ShortcutChangePayload) => void
  ): () => void {
    this.on("change", listener);
    return () => this.off("change", listener);
  }
}

export const globalShortcutStore = new GlobalShortcutStore();
