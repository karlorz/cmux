import { randomUUID } from "node:crypto";
import type { MirrorLocalPack } from "./mirror-local-pack";

const DEFAULT_CHUNK_SIZE = 8 * 1024;

export type PveMirrorLocalExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type PveMirrorLocalExec = (input: {
  instanceId: string;
  teamSlugOrId: string;
  command: string;
}) => Promise<PveMirrorLocalExecResult>;

export type PveMirrorLocalApplyProgress = "uploading" | "applying";

export type ApplyMirrorLocalPackToPveOptions = {
  instanceId: string;
  teamSlugOrId: string;
  pack: MirrorLocalPack;
  exec: PveMirrorLocalExec;
  chunkSize?: number;
  remoteNonce?: string;
  onProgress?: (state: PveMirrorLocalApplyProgress) => void;
};

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function assertExecSucceeded(
  result: PveMirrorLocalExecResult,
  operation: string,
): void {
  if (result.exitCode === 0) {
    return;
  }
  const detail = `${result.stderr}\n${result.stdout}`.trim();
  throw new Error(
    detail
      ? `Mirror local ${operation} failed (exit ${result.exitCode}): ${detail}`
      : `Mirror local ${operation} failed (exit ${result.exitCode})`,
  );
}

function chunkString(value: string, chunkSize: number): string[] {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error(
      "Mirror local upload chunk size must be a positive integer",
    );
  }
  const chunks: string[] = [];
  for (let offset = 0; offset < value.length; offset += chunkSize) {
    chunks.push(value.slice(offset, offset + chunkSize));
  }
  return chunks;
}

function buildValidateAndExtractCommand(
  remoteArchive: string,
  sha256: string,
): string {
  const quotedArchive = shellSingleQuote(remoteArchive);
  const quotedSha = shellSingleQuote(sha256);
  return [
    "set -eu",
    `archive=${quotedArchive}`,
    'cleanup() { rm -f "$archive"; }',
    "trap cleanup EXIT",
    'actual_sha="$(sha256sum "$archive" | awk \'{print $1}\')"',
    `[ "$actual_sha" = ${quotedSha} ]`,
    'tar -tzf "$archive" | while IFS= read -r entry; do',
    '  case "$entry" in /*|../*|*/../*|*/..) echo "unsafe archive path: $entry" >&2; exit 20;; esac',
    '  base="${entry##*/}"',
    '  case "$base" in auth.json|.credentials.json|credentials.json) echo "credential file rejected: $entry" >&2; exit 21;; esac',
    "done",
    'tar -tvzf "$archive" | awk \'substr($1,1,1) != "-" && substr($1,1,1) != "d" { exit 22 }\'',
    "mkdir -p /root",
    'tar -xzf "$archive" -C /root --no-same-owner --no-same-permissions',
  ].join("\n");
}

export async function applyMirrorLocalPackToPve({
  instanceId,
  teamSlugOrId,
  pack,
  exec,
  chunkSize = DEFAULT_CHUNK_SIZE,
  remoteNonce = randomUUID(),
  onProgress,
}: ApplyMirrorLocalPackToPveOptions): Promise<void> {
  const remoteArchive = `/tmp/cmux-mirror-${remoteNonce}.tar.gz`;
  const quotedArchive = shellSingleQuote(remoteArchive);
  let applied = false;

  try {
    onProgress?.("uploading");
    assertExecSucceeded(
      await exec({
        instanceId,
        teamSlugOrId,
        command: `umask 077 && : > ${quotedArchive}`,
      }),
      "upload initialization",
    );

    const encoded = Buffer.from(pack.archive).toString("base64");
    for (const chunk of chunkString(encoded, chunkSize)) {
      assertExecSucceeded(
        await exec({
          instanceId,
          teamSlugOrId,
          command: `printf '%s' ${shellSingleQuote(chunk)} | base64 -d >> ${quotedArchive}`,
        }),
        "upload",
      );
    }

    onProgress?.("applying");
    assertExecSucceeded(
      await exec({
        instanceId,
        teamSlugOrId,
        command: buildValidateAndExtractCommand(remoteArchive, pack.sha256),
      }),
      "apply",
    );
    applied = true;
  } finally {
    if (!applied) {
      assertExecSucceeded(
        await exec({
          instanceId,
          teamSlugOrId,
          command: `rm -f ${quotedArchive}`,
        }),
        "cleanup",
      );
    }
  }
}
