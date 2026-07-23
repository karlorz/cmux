import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { x as extractTar } from "tar";
import { describe, expect, it } from "vitest";
import {
  createMirrorLocalPack,
  MirrorLocalPackError,
} from "./mirror-local-pack";

async function writeTree(
  root: string,
  files: Record<string, string>,
): Promise<void> {
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = join(root, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, contents, "utf8");
  }
}

async function extractPack(archive: Uint8Array): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cmux-mirror-extract-"));
  const archivePath = join(root, "pack.tar.gz");
  const destination = join(root, "out");
  await mkdir(destination);
  await writeFile(archivePath, archive);
  await extractTar({ cwd: destination, file: archivePath, gzip: true });
  return destination;
}

describe("createMirrorLocalPack", () => {
  it("packs only allowlisted config, redacts secrets, rewrites paths, and drops macOS MCP entries", async () => {
    const home = await mkdtemp(join(tmpdir(), "cmux-mirror-home-"));
    await writeTree(home, {
      ".claude/settings.json": JSON.stringify({
        apiKey: "claude-secret",
        nested: { access_token: "nested-secret" },
        notes: `${home}/.claude/skills/demo`,
        mcpServers: {
          portable: { command: "npx", args: ["-y", "portable-mcp"] },
          macOnly: {
            command: "/Applications/Demo.app/Contents/MacOS/demo",
            args: [],
          },
        },
      }),
      ".claude/skills/demo/SKILL.md": `path: ${home}/.claude/skills/demo\n`,
      ".claude/projects/session.json": "must not ship",
      ".codex/config.toml": `api_key = "codex-secret"

[projects."${home}"]
trust_level = "trusted"

[projects."/root"]
trust_level = "trusted"
`,
      ".codex/auth.json": JSON.stringify({ access_token: "oauth-secret" }),
    });

    const pack = await createMirrorLocalPack({ homeDir: home });
    const extracted = await extractPack(pack.archive);

    const settings = await readFile(
      join(extracted, ".claude/settings.json"),
      "utf8",
    );
    expect(settings).not.toContain("claude-secret");
    expect(settings).not.toContain("nested-secret");
    expect(settings).not.toContain("/Applications/");
    expect(settings).not.toContain(home);
    expect(settings).toContain("/root/.claude/skills/demo");
    expect(settings).toContain("portable-mcp");

    const config = await readFile(
      join(extracted, ".codex/config.toml"),
      "utf8",
    );
    expect(config).not.toContain("codex-secret");
    expect(config).not.toContain(home);
    expect(config.match(/\[projects\."\/root"\]/g)).toHaveLength(1);

    await expect(
      readFile(join(extracted, ".codex/auth.json"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(join(extracted, ".claude/projects/session.json"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });

    expect(pack.fileCount).toBe(3);
    expect(pack.compressedBytes).toBe(pack.archive.byteLength);
    expect(pack.sha256).toBe(
      createHash("sha256").update(pack.archive).digest("hex"),
    );
  });

  it("follows skill directory symlinks only inside approved roots", async () => {
    const home = await mkdtemp(join(tmpdir(), "cmux-mirror-home-"));
    const approved = join(home, ".agents", "skills", "demo");
    await writeTree(home, {
      ".agents/skills/demo/SKILL.md": "# demo\n",
    });
    await mkdir(join(home, ".claude", "skills"), { recursive: true });
    await symlink(approved, join(home, ".claude", "skills", "demo"));

    const pack = await createMirrorLocalPack({ homeDir: home });
    const extracted = await extractPack(pack.archive);
    expect(
      await readFile(
        join(extracted, ".claude", "skills", "demo", "SKILL.md"),
        "utf8",
      ),
    ).toBe("# demo\n");
  });

  it("rejects skill symlinks that escape approved host roots", async () => {
    const home = await mkdtemp(join(tmpdir(), "cmux-mirror-home-"));
    const outside = await mkdtemp(join(tmpdir(), "cmux-mirror-outside-"));
    await writeTree(outside, { "SKILL.md": "# outside\n" });
    await mkdir(join(home, ".claude", "skills"), { recursive: true });
    await symlink(outside, join(home, ".claude", "skills", "outside"));

    await expect(
      createMirrorLocalPack({ homeDir: home }),
    ).rejects.toMatchObject({
      code: "unsafe-symlink",
    } satisfies Partial<MirrorLocalPackError>);
  });

  it("enforces file-count and per-file limits", async () => {
    const home = await mkdtemp(join(tmpdir(), "cmux-mirror-home-"));
    await writeTree(home, {
      ".claude/skills/a/SKILL.md": "a",
      ".claude/skills/b/SKILL.md": "b",
    });

    await expect(
      createMirrorLocalPack({
        homeDir: home,
        limits: { maxFiles: 1 },
      }),
    ).rejects.toMatchObject({ code: "file-count-limit" });

    await expect(
      createMirrorLocalPack({
        homeDir: home,
        limits: { maxFileBytes: 0 },
      }),
    ).rejects.toMatchObject({ code: "file-size-limit" });
  });

  it("produces deterministic bytes for unchanged input", async () => {
    const home = await mkdtemp(join(tmpdir(), "cmux-mirror-home-"));
    await writeTree(home, {
      ".claude/settings.json": JSON.stringify({ model: "claude" }),
      ".codex/config.toml": 'model = "gpt"\n',
    });

    const first = await createMirrorLocalPack({ homeDir: home });
    const second = await createMirrorLocalPack({ homeDir: home });
    expect(second.sha256).toBe(first.sha256);
    expect(Buffer.from(second.archive)).toEqual(Buffer.from(first.archive));
  });

  it("returns a valid empty pack when no allowlisted files exist", async () => {
    const home = await mkdtemp(join(tmpdir(), "cmux-mirror-home-"));
    const pack = await createMirrorLocalPack({ homeDir: home });
    expect(pack.fileCount).toBe(0);
    expect(pack.expandedBytes).toBe(0);
    expect(pack.compressedBytes).toBeGreaterThan(0);
  });
});
