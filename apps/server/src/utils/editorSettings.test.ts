import { describe, expect, it } from "vitest";
import { getEditorSettingsUpload, normalizeExtensionSpecs } from "./editorSettings";

function decodeAuthFileContent(
  upload: NonNullable<Awaited<ReturnType<typeof getEditorSettingsUpload>>>,
  destinationPath: string
): string {
  const file = upload.authFiles.find((f) => f.destinationPath === destinationPath);
  expect(file).toBeDefined();
  return Buffer.from(file?.contentBase64 ?? "", "base64").toString("utf8");
}

describe("normalizeExtensionSpecs", () => {
  it("preserves id@version and deduplicates by preferring versioned entries", () => {
    const normalized = normalizeExtensionSpecs([
      "anthropic.claude-code",
      "anthropic.claude-code@2.1.44",
      "foo.bar",
      "foo.bar@1.2.3",
      "anthropic.claude-code@2.0.13",
    ]);

    expect(normalized).toEqual([
      { id: "anthropic.claude-code", version: "2.1.44" },
      { id: "foo.bar", version: "1.2.3" },
    ]);
  });

  it("keeps the first versioned entry for the same extension id", () => {
    const normalized = normalizeExtensionSpecs([
      "anthropic.claude-code@2.1.44",
      "anthropic.claude-code@2.0.13",
    ]);

    expect(normalized).toEqual([
      { id: "anthropic.claude-code", version: "2.1.44" },
    ]);
  });
});

describe("getEditorSettingsUpload (user-uploaded)", () => {
  it("includes extension installer auth files and startup command", async () => {
    const upload = await getEditorSettingsUpload({
      extensions: "ms-python.python\n\nfoo.bar\nms-python.python\n",
    });

    expect(upload).not.toBeNull();
    if (!upload) {
      throw new Error("Expected non-null upload");
    }

    expect(upload.startupCommands).toEqual([
      'bash "/root/.cmux/install-extensions-background.sh" || true',
    ]);

    expect(
      decodeAuthFileContent(upload, "/root/.cmux/user-extensions.txt")
    ).toBe("ms-python.python\nfoo.bar\n");

    expect(
      upload.authFiles.some(
        (f) => f.destinationPath === "/root/.cmux/install-extensions-background.sh"
      )
    ).toBe(true);
    expect(
      upload.authFiles.some(
        (f) => f.destinationPath === "/etc/profile.d/cmux-extensions.sh"
      )
    ).toBe(true);
  });

  it("keeps versioned entries when both unversioned and versioned lines are present", async () => {
    const upload = await getEditorSettingsUpload({
      extensions:
        "anthropic.claude-code\nanthropic.claude-code@2.1.44\nfoo.bar\n",
    });

    expect(upload).not.toBeNull();
    if (!upload) {
      throw new Error("Expected non-null upload");
    }

    expect(
      decodeAuthFileContent(upload, "/root/.cmux/user-extensions.txt")
    ).toBe("anthropic.claude-code@2.1.44\nfoo.bar\n");
  });

  it("generates installer script with SKIP/PIN/INSTALL behavior", async () => {
    const upload = await getEditorSettingsUpload({
      extensions: "anthropic.claude-code@2.1.44\nfoo.bar\n",
    });

    expect(upload).not.toBeNull();
    if (!upload) {
      throw new Error("Expected non-null upload");
    }

    const installScript = decodeAuthFileContent(
      upload,
      "/root/.cmux/install-extensions-background.sh"
    );

    expect(installScript).toContain(
      'echo "SKIP installed $ext_id@$current_version" >>"$LOG_FILE"'
    );
    expect(installScript).toContain(
      'echo "PIN $ext_id@$ext_version" >>"$LOG_FILE"'
    );
    expect(installScript).toContain(
      'echo "INSTALL $ext_id (missing)" >>"$LOG_FILE"'
    );
    expect(installScript).toContain(
      '--install-extension "$ext_id@$ext_version" --force --extensions-dir "$EXT_DIR" --user-data-dir "$USER_DIR"'
    );
    expect(installScript).toContain(
      '--install-extension "$ext_id" --extensions-dir "$EXT_DIR" --user-data-dir "$USER_DIR"'
    );
    expect(installScript).not.toContain(
      '--install-extension "$ext_id" --force --extensions-dir "$EXT_DIR" --user-data-dir "$USER_DIR"'
    );
  });
});
