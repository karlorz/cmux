import {
  compareReleaseVersions,
  parseReleaseTag,
  type RemoteTagRef,
} from "./release-version";

export type TagSyncAction =
  | {
      type: "create";
      tag: string;
      upstreamObjectId: string;
      originObjectId: null;
      deleteRelease: false;
    }
  | {
      type: "repair";
      tag: string;
      upstreamObjectId: string;
      originObjectId: string;
      deleteRelease: true;
    };

export type TagSyncPlan = {
  actions: TagSyncAction[];
  mirroredTags: string[];
};

function isPlainReleaseRemoteTag(ref: RemoteTagRef): boolean {
  const parsed = parseReleaseTag(ref.name);
  return parsed?.version.suffix === null;
}

export function planUpstreamTagSync(
  originRefs: Iterable<RemoteTagRef>,
  upstreamRefs: Iterable<RemoteTagRef>
): TagSyncPlan {
  const originMap = new Map<string, RemoteTagRef>();
  for (const ref of originRefs) {
    if (!isPlainReleaseRemoteTag(ref)) {
      continue;
    }
    originMap.set(ref.name, ref);
  }

  const upstreamReleaseRefs = [...upstreamRefs]
    .filter((ref) => isPlainReleaseRemoteTag(ref))
    .sort((left, right) => {
      const leftParsed = parseReleaseTag(left.name);
      const rightParsed = parseReleaseTag(right.name);
      if (!leftParsed || !rightParsed) {
        return 0;
      }
      return compareReleaseVersions(leftParsed.version, rightParsed.version);
    });

  const actions: TagSyncAction[] = [];

  for (const upstreamRef of upstreamReleaseRefs) {
    const originRef = originMap.get(upstreamRef.name);
    if (!originRef) {
      actions.push({
        type: "create",
        tag: upstreamRef.name,
        upstreamObjectId: upstreamRef.targetObjectId,
        originObjectId: null,
        deleteRelease: false,
      });
      continue;
    }

    if (originRef.targetObjectId !== upstreamRef.targetObjectId) {
      actions.push({
        type: "repair",
        tag: upstreamRef.name,
        upstreamObjectId: upstreamRef.targetObjectId,
        originObjectId: originRef.targetObjectId,
        deleteRelease: true,
      });
    }
  }

  return {
    actions,
    mirroredTags: upstreamReleaseRefs.map((ref) => ref.name),
  };
}
