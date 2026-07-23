import { createHash } from "node:crypto";
import type { Stats } from "node:fs";
import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { gzipSync } from "node:zlib";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  sep,
} from "node:path";
import { c as createTar } from "tar";

export const MIRROR_LOCAL_POLICY_VERSION = "cmux-mirror-local/v1";

export const MIRROR_LOCAL_DEFAULT_INCLUDE_PATHS = [
  ".claude/settings.json",
  ".claude/config.json",
  ".claude/keybindings.json",
  ".claude/skills",
  ".claude/hooks",
  ".claude/commands",
  ".codex/config.toml",
  ".codex/keybindings.json",
  ".codex/AGENTS.md",
  ".codex/skills",
  ".codex/hooks",
  ".codex/automations",
] as const;

const SECRET_FILE_BASENAMES = new Set([
  "auth.json",
  ".credentials.json",
  "credentials.json",
]);

const EXCLUDED_DIRECTORY_NAMES = new Set([
  "projects",
  "sessions",
  "archived_sessions",
  "cache",
  "caches",
  ".tmp",
  "tmp",
  "debug",
  "telemetry",
  "shell-snapshots",
  "shell_snapshots",
  "statsig",
  "todos",
  "file-history",
  "plugins",
  "backups",
  "node_modules",
  ".git",
]);

const SECRET_JSON_KEYS = new Set([
  "apiKey",
  "api_key",
  "token",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "password",
  "secret",
  "clientSecret",
  "client_secret",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
]);

const SKIPPED_FILE_SUFFIXES = [
  ".sqlite",
  ".sqlite3",
  ".db",
  ".lock",
  ".wal",
  ".shm",
] as const;

const TEXT_FILE_SUFFIXES = [
  ".json",
  ".toml",
  ".yaml",
  ".yml",
  ".md",
  ".txt",
  ".sh",
  ".js",
  ".ts",
  ".mjs",
  ".cjs",
] as const;

export type MirrorLocalPackLimits = {
  maxCompressedBytes: number;
  maxExpandedBytes: number;
  maxFileBytes: number;
  maxFiles: number;
};

export const MIRROR_LOCAL_DEFAULT_LIMITS: MirrorLocalPackLimits = {
  maxCompressedBytes: 8 * 1024 * 1024,
  maxExpandedBytes: 64 * 1024 * 1024,
  maxFileBytes: 2 * 1024 * 1024,
  maxFiles: 2_000,
};

export type MirrorLocalPack = {
  archive: Uint8Array;
  sha256: string;
  policyVersion: string;
  fileCount: number;
  expandedBytes: number;
  compressedBytes: number;
};

export type MirrorLocalPackErrorCode =
  | "unsafe-include-path"
  | "unsafe-symlink"
  | "symlink-cycle"
  | "file-count-limit"
  | "file-size-limit"
  | "expanded-size-limit"
  | "compressed-size-limit"
  | "invalid-json";

export class MirrorLocalPackError extends Error {
  readonly code: MirrorLocalPackErrorCode;

  constructor(code: MirrorLocalPackErrorCode, message: string) {
    super(message);
    this.name = "MirrorLocalPackError";
    this.code = code;
  }
}

export type CreateMirrorLocalPackOptions = {
  homeDir?: string;
  targetHome?: string;
  includePaths?: readonly string[];
  allowedSymlinkRoots?: readonly string[];
  limits?: Partial<MirrorLocalPackLimits>;
};

type FileRecord = {
  archivePath: string;
  contents: Uint8Array;
};

function normalizeArchivePath(input: string): string {
  const withoutTilde = input.startsWith("~/") ? input.slice(2) : input;
  const normalizedPath = normalize(withoutTilde).split(sep).join("/");
  if (
    !normalizedPath ||
    isAbsolute(withoutTilde) ||
    normalizedPath === ".." ||
    normalizedPath.startsWith("../") ||
    normalizedPath.includes("/../")
  ) {
    throw new MirrorLocalPackError(
      "unsafe-include-path",
      `Unsafe Mirror local include path: ${input}`,
    );
  }
  return normalizedPath.replace(/^\.\//, "");
}

function isPathInside(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === "" ||
    (!pathFromRoot.startsWith(`..${sep}`) &&
      pathFromRoot !== ".." &&
      !isAbsolute(pathFromRoot))
  );
}

function isSkillArchivePath(archivePath: string): boolean {
  return (
    archivePath === ".claude/skills" ||
    archivePath.startsWith(".claude/skills/") ||
    archivePath === ".codex/skills" ||
    archivePath.startsWith(".codex/skills/")
  );
}

function isTextConfig(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return (
    TEXT_FILE_SUFFIXES.some((suffix) => lower.endsWith(suffix)) ||
    lower === "config"
  );
}

function redactJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactJsonValue(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] = SECRET_JSON_KEYS.has(key) ? "" : redactJsonValue(child);
  }
  return result;
}

function isMacOsOnlyMcpServer(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const server = value as Record<string, unknown>;
  const fields: string[] = [];
  if (typeof server.command === "string") {
    fields.push(server.command);
  }
  if (Array.isArray(server.args)) {
    for (const argument of server.args) {
      if (typeof argument === "string") {
        fields.push(argument);
      }
    }
  }
  const joined = fields.join(" ");
  return [
    "/Applications/",
    ".app/Contents/",
    "/Library/Application Support/",
    "osascript",
  ].some((marker) => joined.includes(marker));
}

function removeMacOsOnlyMcpServers(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const root = value as Record<string, unknown>;
  for (const key of ["mcpServers", "mcp"]) {
    const rawServers = root[key];
    if (
      !rawServers ||
      typeof rawServers !== "object" ||
      Array.isArray(rawServers)
    ) {
      continue;
    }
    const servers = rawServers as Record<string, unknown>;
    for (const [name, server] of Object.entries(servers)) {
      if (isMacOsOnlyMcpServer(server)) {
        delete servers[name];
      }
    }
  }
  return root;
}

function redactTomlSecrets(contents: string): string {
  return contents
    .split("\n")
    .map((line) => {
      const match = line.match(/^(\s*)([A-Za-z0-9_]+)\s*=/);
      if (!match || !SECRET_JSON_KEYS.has(match[2] ?? "")) {
        return line;
      }
      return `${match[1] ?? ""}${match[2]} = ""`;
    })
    .join("\n");
}

function dedupeTomlTables(contents: string): string {
  const seen = new Set<string>();
  const output: string[] = [];
  let skipping = false;

  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    const isTable =
      trimmed.length >= 3 &&
      trimmed.startsWith("[") &&
      trimmed.endsWith("]") &&
      !trimmed.startsWith("[[");
    if (isTable) {
      if (seen.has(trimmed)) {
        skipping = true;
        continue;
      }
      seen.add(trimmed);
      skipping = false;
      output.push(line);
      continue;
    }
    if (!skipping) {
      output.push(line);
    }
  }
  return output.join("\n");
}

function rewriteHomePaths(
  contents: string,
  localHome: string,
  targetHome: string,
): string {
  if (!localHome || localHome === targetHome) {
    return contents;
  }
  return contents.split(localHome).join(targetHome);
}

function transformFile(
  archivePath: string,
  contents: Uint8Array,
  localHome: string,
  targetHome: string,
): Uint8Array {
  const fileName = basename(archivePath);
  if (!isTextConfig(fileName)) {
    return contents;
  }

  const lower = fileName.toLowerCase();
  let text = Buffer.from(contents).toString("utf8");

  if (lower.endsWith(".json")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new MirrorLocalPackError(
        "invalid-json",
        `Refusing to mirror invalid JSON config ${archivePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    parsed = redactJsonValue(parsed);
    if (
      fileName === "settings.json" ||
      fileName === "mcp.json" ||
      fileName === "claude_desktop_config.json"
    ) {
      parsed = removeMacOsOnlyMcpServers(parsed);
    }
    text = `${JSON.stringify(parsed, null, 2)}\n`;
  }

  if (isTextConfig(fileName)) {
    text = rewriteHomePaths(text, localHome, targetHome);
  }

  if (lower.endsWith(".toml")) {
    text = dedupeTomlTables(redactTomlSecrets(text));
  }

  return Buffer.from(text, "utf8");
}

function mergeLimits(
  overrides: Partial<MirrorLocalPackLimits> | undefined,
): MirrorLocalPackLimits {
  return {
    maxCompressedBytes:
      overrides?.maxCompressedBytes ??
      MIRROR_LOCAL_DEFAULT_LIMITS.maxCompressedBytes,
    maxExpandedBytes:
      overrides?.maxExpandedBytes ??
      MIRROR_LOCAL_DEFAULT_LIMITS.maxExpandedBytes,
    maxFileBytes:
      overrides?.maxFileBytes ?? MIRROR_LOCAL_DEFAULT_LIMITS.maxFileBytes,
    maxFiles: overrides?.maxFiles ?? MIRROR_LOCAL_DEFAULT_LIMITS.maxFiles,
  };
}

async function existingRealPaths(paths: readonly string[]): Promise<string[]> {
  const resolved: string[] = [];
  for (const candidate of paths) {
    try {
      resolved.push(await realpath(candidate));
    } catch {
      // A missing optional skill root cannot be a symlink target.
    }
  }
  return resolved;
}

export async function createMirrorLocalPack(
  options: CreateMirrorLocalPackOptions = {},
): Promise<MirrorLocalPack> {
  const homeDir = resolve(options.homeDir ?? homedir());
  const targetHome = options.targetHome ?? "/root";
  const limits = mergeLimits(options.limits);
  const includePaths = (
    options.includePaths ?? MIRROR_LOCAL_DEFAULT_INCLUDE_PATHS
  ).map(normalizeArchivePath);
  const allowedSymlinkRoots = await existingRealPaths(
    options.allowedSymlinkRoots ?? [
      join(homeDir, ".agents", "skills"),
      join(homeDir, ".claude", "skills"),
      join(homeDir, ".codex", "skills"),
      join(homeDir, ".codex", "plugins", "cache"),
    ],
  );

  const records = new Map<string, FileRecord>();
  let expandedBytes = 0;

  const addFile = async (
    physicalPath: string,
    archivePath: string,
    fileStats: Stats,
  ): Promise<void> => {
    const fileName = basename(physicalPath).toLowerCase();
    if (
      SECRET_FILE_BASENAMES.has(fileName) ||
      SKIPPED_FILE_SUFFIXES.some((suffix) => fileName.endsWith(suffix))
    ) {
      return;
    }

    if (!fileStats.isFile()) {
      return;
    }
    if (fileStats.size > limits.maxFileBytes) {
      throw new MirrorLocalPackError(
        "file-size-limit",
        `Mirror local file exceeds ${limits.maxFileBytes} bytes: ${archivePath}`,
      );
    }
    if (records.size + 1 > limits.maxFiles) {
      throw new MirrorLocalPackError(
        "file-count-limit",
        `Mirror local pack exceeds ${limits.maxFiles} files`,
      );
    }

    const rawContents = await readFile(physicalPath);
    const contents = transformFile(
      archivePath,
      rawContents,
      homeDir,
      targetHome,
    );
    expandedBytes += contents.byteLength;
    if (expandedBytes > limits.maxExpandedBytes) {
      throw new MirrorLocalPackError(
        "expanded-size-limit",
        `Mirror local pack exceeds ${limits.maxExpandedBytes} expanded bytes`,
      );
    }
    records.set(archivePath, { archivePath, contents });
  };

  const walk = async (
    physicalPath: string,
    archivePath: string,
    realDirectoryStack: ReadonlySet<string>,
  ): Promise<void> => {
    let entryStats;
    try {
      entryStats = await lstat(physicalPath);
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? error.code
          : undefined;
      if (code === "ENOENT" || code === "EACCES") {
        return;
      }
      throw error;
    }

    if (entryStats.isSymbolicLink()) {
      if (!isSkillArchivePath(archivePath)) {
        return;
      }
      const target = await realpath(physicalPath);
      if (!allowedSymlinkRoots.some((root) => isPathInside(root, target))) {
        throw new MirrorLocalPackError(
          "unsafe-symlink",
          `Mirror local skill symlink escapes approved roots: ${archivePath}`,
        );
      }
      const targetStats = await stat(target);
      if (targetStats.isDirectory()) {
        if (realDirectoryStack.has(target)) {
          throw new MirrorLocalPackError(
            "symlink-cycle",
            `Mirror local skill symlink cycle detected at ${archivePath}`,
          );
        }
        const nextStack = new Set(realDirectoryStack);
        nextStack.add(target);
        const children = await readdir(target, { withFileTypes: true });
        children.sort((left, right) => left.name.localeCompare(right.name));
        for (const child of children) {
          if (child.isDirectory() && EXCLUDED_DIRECTORY_NAMES.has(child.name)) {
            continue;
          }
          await walk(
            join(target, child.name),
            `${archivePath}/${child.name}`,
            nextStack,
          );
        }
        return;
      }
      await addFile(target, archivePath, targetStats);
      return;
    }

    if (entryStats.isDirectory()) {
      const realDirectory = await realpath(physicalPath);
      if (realDirectoryStack.has(realDirectory)) {
        throw new MirrorLocalPackError(
          "symlink-cycle",
          `Mirror local directory cycle detected at ${archivePath}`,
        );
      }
      const nextStack = new Set(realDirectoryStack);
      nextStack.add(realDirectory);
      const children = await readdir(physicalPath, { withFileTypes: true });
      children.sort((left, right) => left.name.localeCompare(right.name));
      for (const child of children) {
        if (child.isDirectory() && EXCLUDED_DIRECTORY_NAMES.has(child.name)) {
          continue;
        }
        await walk(
          join(physicalPath, child.name),
          `${archivePath}/${child.name}`,
          nextStack,
        );
      }
      return;
    }

    await addFile(physicalPath, archivePath, entryStats);
  };

  for (const includePath of includePaths) {
    await walk(join(homeDir, includePath), includePath, new Set());
  }

  const tempRoot = await mkdtemp(join(tmpdir(), "cmux-mirror-pack-"));
  const stagingRoot = join(tempRoot, "staging");
  const archiveFile = join(tempRoot, "agent-config.tar.gz");
  try {
    await mkdir(stagingRoot, { recursive: true });
    const archiveEntries = [...records.values()].sort((left, right) =>
      left.archivePath.localeCompare(right.archivePath),
    );
    for (const record of archiveEntries) {
      const destination = join(stagingRoot, record.archivePath);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, record.contents, { mode: 0o600 });
    }

    let archive: Buffer;
    if (archiveEntries.length === 0) {
      // A tar archive ends with two 512-byte zero records. Build that directly
      // because node-tar rejects an empty input list.
      archive = gzipSync(Buffer.alloc(1024), { level: 9 });
    } else {
      await createTar(
        {
          cwd: stagingRoot,
          file: archiveFile,
          gzip: { level: 9 },
          mtime: new Date(0),
          portable: true,
          sync: false,
        },
        archiveEntries.map((record) => record.archivePath),
      );
      archive = await readFile(archiveFile);
    }
    if (archive.byteLength > limits.maxCompressedBytes) {
      throw new MirrorLocalPackError(
        "compressed-size-limit",
        `Mirror local pack exceeds ${limits.maxCompressedBytes} compressed bytes`,
      );
    }

    return {
      archive,
      sha256: createHash("sha256").update(archive).digest("hex"),
      policyVersion: MIRROR_LOCAL_POLICY_VERSION,
      fileCount: archiveEntries.length,
      expandedBytes,
      compressedBytes: archive.byteLength,
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
