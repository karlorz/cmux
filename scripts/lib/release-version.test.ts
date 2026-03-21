import { describe, expect, it } from "vitest";

import {
  compareReleaseVersions,
  parseRemoteTagRefs,
  resolveReleaseState,
  resolveRequestedForkReleaseVersion,
} from "./release-version";

describe("resolveReleaseState", () => {
  it("uses the latest upstream plain tag as the first fork release base", () => {
    const state = resolveReleaseState(["v1.0.266", "v1.0.269"]);

    expect(state.latestUpstreamTag).toBe("v1.0.269");
    expect(state.baselineTag).toBe("v1.0.269");
    expect(state.nextForkTag).toBe("v1.0.269-0");
  });

  it("continues incrementing suffixed fork tags for the current upstream base", () => {
    const state = resolveReleaseState([
      "v1.0.266",
      "v1.0.269",
      "v1.0.269-0",
      "v1.0.269-1",
    ]);

    expect(state.latestForkTag).toBe("v1.0.269-1");
    expect(state.baselineTag).toBe("v1.0.269-1");
    expect(state.nextForkVersion).toBe("1.0.269-2");
  });

  it("resets the suffix counter when upstream advances to a newer plain tag", () => {
    const state = resolveReleaseState([
      "v1.0.269",
      "v1.0.269-0",
      "v1.0.269-1",
      "v1.0.270",
    ]);

    expect(state.latestUpstreamTag).toBe("v1.0.270");
    expect(state.latestForkTag).toBeNull();
    expect(state.baselineTag).toBe("v1.0.270");
    expect(state.nextForkTag).toBe("v1.0.270-0");
  });

  it("ignores invalid or unrelated tags", () => {
    const state = resolveReleaseState([
      "v1.0.269",
      "host-screenshot-collector-v0.1.0-20260124033657-99a7d9c",
      "devsh-memory-mcp@0.2.1",
      "v1.0.269-beta",
      "v1.0",
    ]);

    expect(state.latestUpstreamTag).toBe("v1.0.269");
    expect(state.nextForkTag).toBe("v1.0.269-0");
  });
});

describe("resolveRequestedForkReleaseVersion", () => {
  const tags = ["v1.0.269", "v1.0.269-0", "v1.0.269-1"];

  it("uses the computed next fork version by default", () => {
    const resolved = resolveRequestedForkReleaseVersion(tags);

    expect(resolved.version).toBe("1.0.269-2");
    expect(resolved.tag).toBe("v1.0.269-2");
  });

  it("accepts a later exact suffixed version on the current upstream base", () => {
    const resolved = resolveRequestedForkReleaseVersion(tags, "1.0.269-5");

    expect(resolved.version).toBe("1.0.269-5");
    expect(resolved.tag).toBe("v1.0.269-5");
  });

  it("rejects plain semver versions for fork releases", () => {
    expect(() => resolveRequestedForkReleaseVersion(tags, "1.0.269")).toThrow(
      /must use a numeric suffix/
    );
  });

  it("rejects older or equal fork versions", () => {
    expect(() => resolveRequestedForkReleaseVersion(tags, "1.0.269-1")).toThrow(
      /must be greater than the current baseline/
    );
  });

  it("rejects versions on a different base than the latest upstream tag", () => {
    expect(() => resolveRequestedForkReleaseVersion(tags, "1.0.270-0")).toThrow(
      /must use the latest upstream base version 1.0.269/
    );
  });
});

describe("compareReleaseVersions", () => {
  it("orders plain tags before suffixed tags on the same base", () => {
    expect(compareReleaseVersions("1.0.269", "1.0.269-0")).toBeLessThan(0);
    expect(compareReleaseVersions("1.0.269-2", "1.0.269-1")).toBeGreaterThan(0);
  });

  it("keeps higher base versions ahead of older suffixed versions", () => {
    expect(compareReleaseVersions("1.0.270", "1.0.269-99")).toBeGreaterThan(0);
  });
});

describe("parseRemoteTagRefs", () => {
  it("prefers peeled object ids when ls-remote includes annotated tag lines", () => {
    const refs = parseRemoteTagRefs(
      [
        "1111111111111111111111111111111111111111\trefs/tags/v1.0.269",
        "2222222222222222222222222222222222222222\trefs/tags/v1.0.269^{}",
      ].join("\n")
    );

    expect(refs).toEqual([
      {
        name: "v1.0.269",
        objectId: "1111111111111111111111111111111111111111",
        peeledObjectId: "2222222222222222222222222222222222222222",
        targetObjectId: "2222222222222222222222222222222222222222",
      },
    ]);
  });

  it("preserves lightweight tag object ids", () => {
    const refs = parseRemoteTagRefs(
      "3333333333333333333333333333333333333333\trefs/tags/v1.0.269-0"
    );

    expect(refs[0]?.targetObjectId).toBe(
      "3333333333333333333333333333333333333333"
    );
    expect(refs[0]?.peeledObjectId).toBeNull();
  });
});
