export type ReleaseVersion = {
  major: number;
  minor: number;
  patch: number;
  suffix: number | null;
};

export type ParsedReleaseTag = {
  tag: string;
  version: ReleaseVersion;
};

export type RemoteTagRef = {
  name: string;
  objectId: string;
  peeledObjectId: string | null;
  targetObjectId: string;
};

export type ReleaseState = {
  latestUpstreamTag: string | null;
  latestUpstreamVersion: string | null;
  latestForkTag: string | null;
  latestForkVersion: string | null;
  baselineTag: string | null;
  baselineVersion: string | null;
  nextForkTag: string | null;
  nextForkVersion: string | null;
};

const releaseVersionPattern = /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:-(?<suffix>\d+))?$/;

function compareNumber(left: number, right: number): number {
  if (left === right) {
    return 0;
  }
  return left > right ? 1 : -1;
}

export function normalizeVersionInput(value: string): string {
  return value.startsWith("v") ? value.slice(1) : value;
}

export function parseReleaseVersion(value: string): ReleaseVersion | null {
  const normalized = normalizeVersionInput(value.trim());
  const match = releaseVersionPattern.exec(normalized);
  if (!match?.groups) {
    return null;
  }

  const major = Number.parseInt(match.groups.major ?? "", 10);
  const minor = Number.parseInt(match.groups.minor ?? "", 10);
  const patch = Number.parseInt(match.groups.patch ?? "", 10);
  const suffixGroup = match.groups.suffix;

  if ([major, minor, patch].some((part) => Number.isNaN(part))) {
    return null;
  }

  const suffix =
    typeof suffixGroup === "string" ? Number.parseInt(suffixGroup, 10) : null;

  if (suffix !== null && Number.isNaN(suffix)) {
    return null;
  }

  return {
    major,
    minor,
    patch,
    suffix,
  };
}

export function assertReleaseVersion(value: string): ReleaseVersion {
  const parsed = parseReleaseVersion(value);
  if (!parsed) {
    throw new Error(
      `Version "${normalizeVersionInput(value)}" is not a valid release version (x.y.z or x.y.z-n).`
    );
  }
  return parsed;
}

export function formatReleaseVersion(version: ReleaseVersion): string {
  const base = `${version.major}.${version.minor}.${version.patch}`;
  return version.suffix === null ? base : `${base}-${version.suffix}`;
}

export function baseReleaseVersion(version: ReleaseVersion | string): string {
  const parsed =
    typeof version === "string" ? assertReleaseVersion(version) : version;
  return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
}

export function toReleaseTag(version: ReleaseVersion | string): string {
  const parsed =
    typeof version === "string" ? assertReleaseVersion(version) : version;
  return `v${formatReleaseVersion(parsed)}`;
}

export function compareReleaseVersions(
  left: ReleaseVersion | string,
  right: ReleaseVersion | string
): number {
  const parsedLeft = typeof left === "string" ? assertReleaseVersion(left) : left;
  const parsedRight =
    typeof right === "string" ? assertReleaseVersion(right) : right;

  const baseComparisons = [
    compareNumber(parsedLeft.major, parsedRight.major),
    compareNumber(parsedLeft.minor, parsedRight.minor),
    compareNumber(parsedLeft.patch, parsedRight.patch),
  ];

  const firstBaseDiff = baseComparisons.find((comparison) => comparison !== 0);
  if (typeof firstBaseDiff === "number") {
    return firstBaseDiff;
  }

  if (parsedLeft.suffix === parsedRight.suffix) {
    return 0;
  }
  if (parsedLeft.suffix === null) {
    return -1;
  }
  if (parsedRight.suffix === null) {
    return 1;
  }
  return compareNumber(parsedLeft.suffix, parsedRight.suffix);
}

export function parseReleaseTag(tag: string): ParsedReleaseTag | null {
  const trimmed = tag.trim();
  if (!trimmed.startsWith("v")) {
    return null;
  }

  const version = parseReleaseVersion(trimmed.slice(1));
  if (!version) {
    return null;
  }

  return {
    tag: toReleaseTag(version),
    version,
  };
}

export function assertForkReleaseVersion(value: string): string {
  const parsed = assertReleaseVersion(value);
  if (parsed.suffix === null) {
    throw new Error(
      `Fork release version "${formatReleaseVersion(parsed)}" must use a numeric suffix (for example 1.0.269-0).`
    );
  }
  return formatReleaseVersion(parsed);
}

export function resolveReleaseState(tags: Iterable<string>): ReleaseState {
  const parsedTags = [...new Set([...tags].map((tag) => tag.trim()).filter(Boolean))]
    .map((tag) => parseReleaseTag(tag))
    .filter((tag): tag is ParsedReleaseTag => tag !== null)
    .sort((left, right) => compareReleaseVersions(left.version, right.version));

  const plainTags = parsedTags.filter((tag) => tag.version.suffix === null);

  if (plainTags.length === 0) {
    return {
      latestUpstreamTag: null,
      latestUpstreamVersion: null,
      latestForkTag: null,
      latestForkVersion: null,
      baselineTag: null,
      baselineVersion: null,
      nextForkTag: null,
      nextForkVersion: null,
    };
  }

  const latestUpstream = plainTags[plainTags.length - 1];
  const latestUpstreamBase = baseReleaseVersion(latestUpstream.version);
  const matchingForkTags = parsedTags.filter(
    (tag) =>
      tag.version.suffix !== null &&
      baseReleaseVersion(tag.version) === latestUpstreamBase
  );

  const latestFork =
    matchingForkTags.length > 0
      ? matchingForkTags[matchingForkTags.length - 1]
      : null;

  const baseline = latestFork ?? latestUpstream;
  const nextSuffix =
    latestFork !== null && latestFork.version.suffix !== null
      ? latestFork.version.suffix + 1
      : 0;
  const nextForkVersion = `${latestUpstreamBase}-${nextSuffix}`;

  return {
    latestUpstreamTag: latestUpstream.tag,
    latestUpstreamVersion: formatReleaseVersion(latestUpstream.version),
    latestForkTag: latestFork?.tag ?? null,
    latestForkVersion:
      latestFork !== null ? formatReleaseVersion(latestFork.version) : null,
    baselineTag: baseline.tag,
    baselineVersion: formatReleaseVersion(baseline.version),
    nextForkTag: `v${nextForkVersion}`,
    nextForkVersion,
  };
}

export function resolveRequestedForkReleaseVersion(
  tags: Iterable<string>,
  requestedVersion?: string
): { state: ReleaseState; version: string; tag: string } {
  const state = resolveReleaseState(tags);
  if (
    !state.latestUpstreamVersion ||
    !state.baselineVersion ||
    !state.nextForkVersion ||
    !state.nextForkTag
  ) {
    throw new Error("No mirrored upstream release tags were found.");
  }

  if (!requestedVersion) {
    return {
      state,
      version: state.nextForkVersion,
      tag: state.nextForkTag,
    };
  }

  const requested = assertReleaseVersion(requestedVersion);
  if (requested.suffix === null) {
    throw new Error(
      `Fork release version "${formatReleaseVersion(requested)}" must use a numeric suffix (for example ${state.nextForkVersion}).`
    );
  }

  const requestedBase = baseReleaseVersion(requested);
  if (requestedBase !== state.latestUpstreamVersion) {
    throw new Error(
      `Fork release version "${formatReleaseVersion(requested)}" must use the latest upstream base version ${state.latestUpstreamVersion}.`
    );
  }

  if (compareReleaseVersions(requested, state.baselineVersion) <= 0) {
    throw new Error(
      `Fork release version "${formatReleaseVersion(requested)}" must be greater than the current baseline ${state.baselineVersion}.`
    );
  }

  return {
    state,
    version: formatReleaseVersion(requested),
    tag: toReleaseTag(requested),
  };
}

export function parseRemoteTagRefs(output: string): RemoteTagRef[] {
  const refs = new Map<string, { objectId: string | null; peeledObjectId: string | null }>();

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const [objectId, refName] = trimmed.split(/\s+/, 2);
    if (!objectId || !refName?.startsWith("refs/tags/")) {
      continue;
    }

    const rawTagName = refName.slice("refs/tags/".length);
    const isPeeled = rawTagName.endsWith("^{}");
    const tagName = isPeeled ? rawTagName.slice(0, -3) : rawTagName;
    const existing = refs.get(tagName) ?? { objectId: null, peeledObjectId: null };

    if (isPeeled) {
      existing.peeledObjectId = objectId;
    } else {
      existing.objectId = objectId;
    }

    refs.set(tagName, existing);
  }

  return [...refs.entries()]
    .map(([name, ids]) => {
      const objectId = ids.objectId ?? ids.peeledObjectId;
      if (!objectId) {
        return null;
      }

      return {
        name,
        objectId,
        peeledObjectId: ids.peeledObjectId,
        targetObjectId: ids.peeledObjectId ?? objectId,
      };
    })
    .filter((ref): ref is RemoteTagRef => ref !== null);
}

export function listReleaseTagsFromRemoteRefs(refs: Iterable<RemoteTagRef>): string[] {
  return [...refs].map((ref) => ref.name);
}
