import { describe, expect, it } from "vitest";
import {
  createInitialVncRfbState,
  DEFAULT_MAX_AUTO_REMOUNTS,
  forcedIframeStatusForRecovery,
  isVncPreviewUrl,
  parseVncRfbStatusMessage,
  reduceVncRfbRecovery,
  RFB_TIMEOUT_ERROR_MESSAGE,
  VNC_RFB_READY_MESSAGE_TYPE,
  VNC_RFB_TIMEOUT_MESSAGE_TYPE,
} from "./vnc-preview-recovery";

describe("reduceVncRfbRecovery", () => {
  it("starts in idle with zero remounts", () => {
    const state = createInitialVncRfbState();
    expect(state.phase).toBe("idle");
    expect(state.autoRemountCount).toBe(0);
    expect(state.remountGeneration).toBe(0);
    expect(forcedIframeStatusForRecovery(state)).toBeNull();
  });

  it("START enters waiting with loading overlay", () => {
    const state = reduceVncRfbRecovery(createInitialVncRfbState(), {
      type: "START",
    });
    expect(state.phase).toBe("waiting");
    expect(forcedIframeStatusForRecovery(state)).toBe("loading");
  });

  it("RFB_READY after load clears overlay", () => {
    let state = reduceVncRfbRecovery(createInitialVncRfbState(), {
      type: "START",
    });
    state = reduceVncRfbRecovery(state, { type: "IFRAME_LOADED" });
    state = reduceVncRfbRecovery(state, { type: "RFB_READY" });
    expect(state.phase).toBe("ready");
    expect(state.errorMessage).toBeNull();
    expect(forcedIframeStatusForRecovery(state)).toBeNull();
  });

  it("does not fail on WAIT_TIMEOUT before iframe has loaded", () => {
    let state = reduceVncRfbRecovery(createInitialVncRfbState(), {
      type: "START",
    });
    state = reduceVncRfbRecovery(state, { type: "WAIT_TIMEOUT" });
    expect(state.phase).toBe("waiting");
    expect(state.autoRemountCount).toBe(0);
  });

  it("auto-remounts on timeout up to max, then fails with error message", () => {
    let state = reduceVncRfbRecovery(createInitialVncRfbState(), {
      type: "START",
    });
    state = reduceVncRfbRecovery(state, { type: "IFRAME_LOADED" });

    // First timeout → remount 1
    state = reduceVncRfbRecovery(state, { type: "WAIT_TIMEOUT" });
    expect(state.phase).toBe("remounting");
    expect(state.autoRemountCount).toBe(1);
    expect(state.remountGeneration).toBe(1);
    expect(forcedIframeStatusForRecovery(state)).toBe("loading");

    // Duplicate timeout while remounting is ignored (bridge + parent race)
    const midRemount = reduceVncRfbRecovery(state, { type: "WAIT_TIMEOUT" });
    expect(midRemount).toEqual(state);

    // Remount load complete
    state = reduceVncRfbRecovery(state, { type: "IFRAME_LOADED" });
    expect(state.phase).toBe("waiting");
    expect(state.iframeLoaded).toBe(true);

    // Second timeout → remount 2
    state = reduceVncRfbRecovery(state, { type: "WAIT_TIMEOUT" });
    expect(state.phase).toBe("remounting");
    expect(state.autoRemountCount).toBe(2);
    expect(state.remountGeneration).toBe(2);

    state = reduceVncRfbRecovery(state, { type: "IFRAME_LOADED" });

    // Third timeout with max=2 → failed
    state = reduceVncRfbRecovery(state, { type: "WAIT_TIMEOUT" }, {
      maxAutoRemounts: DEFAULT_MAX_AUTO_REMOUNTS,
    });
    expect(state.phase).toBe("failed");
    expect(state.errorMessage).toBe(RFB_TIMEOUT_ERROR_MESSAGE);
    expect(forcedIframeStatusForRecovery(state)).toBe("error");
  });

  it("MANUAL_RETRY from failed resets auto count and bumps generation", () => {
    let state = reduceVncRfbRecovery(createInitialVncRfbState(), {
      type: "START",
    });
    state = reduceVncRfbRecovery(state, { type: "IFRAME_LOADED" });
    // Exhaust remounts
    for (let i = 0; i < DEFAULT_MAX_AUTO_REMOUNTS; i++) {
      state = reduceVncRfbRecovery(state, { type: "WAIT_TIMEOUT" });
      state = reduceVncRfbRecovery(state, { type: "IFRAME_LOADED" });
    }
    state = reduceVncRfbRecovery(state, { type: "WAIT_TIMEOUT" });
    expect(state.phase).toBe("failed");
    const genBefore = state.remountGeneration;

    state = reduceVncRfbRecovery(state, { type: "MANUAL_RETRY" });
    expect(state.phase).toBe("remounting");
    expect(state.autoRemountCount).toBe(0);
    expect(state.remountGeneration).toBe(genBefore + 1);
    expect(state.errorMessage).toBeNull();
    expect(forcedIframeStatusForRecovery(state)).toBe("loading");
  });

  it("late RFB_READY after failed clears the error", () => {
    let state = reduceVncRfbRecovery(createInitialVncRfbState(), {
      type: "START",
    });
    state = reduceVncRfbRecovery(state, { type: "IFRAME_LOADED" });
    for (let i = 0; i < DEFAULT_MAX_AUTO_REMOUNTS + 1; i++) {
      state = reduceVncRfbRecovery(state, { type: "WAIT_TIMEOUT" });
      if (state.phase === "remounting") {
        state = reduceVncRfbRecovery(state, { type: "IFRAME_LOADED" });
      }
    }
    expect(state.phase).toBe("failed");
    state = reduceVncRfbRecovery(state, { type: "RFB_READY" });
    expect(state.phase).toBe("ready");
    expect(state.errorMessage).toBeNull();
  });

  it("DISABLE resets to idle", () => {
    let state = reduceVncRfbRecovery(createInitialVncRfbState(), {
      type: "START",
    });
    state = reduceVncRfbRecovery(state, { type: "DISABLE" });
    expect(state).toEqual(createInitialVncRfbState());
  });
});

describe("isVncPreviewUrl", () => {
  it("detects noVNC viewer URLs", () => {
    expect(
      isVncPreviewUrl(
        "https://port-39380-pvelxc-x.example.com/vnc.html?tkn=abc&autoconnect=1"
      )
    ).toBe(true);
    expect(isVncPreviewUrl("https://example.com/workspace")).toBe(false);
    expect(isVncPreviewUrl(null)).toBe(false);
  });
});

describe("parseVncRfbStatusMessage", () => {
  it("parses ready and timeout postMessages", () => {
    expect(parseVncRfbStatusMessage({ type: VNC_RFB_READY_MESSAGE_TYPE })).toEqual({
      type: VNC_RFB_READY_MESSAGE_TYPE,
    });
    expect(
      parseVncRfbStatusMessage({
        type: VNC_RFB_TIMEOUT_MESSAGE_TYPE,
        retries: 50,
      })
    ).toEqual({ type: VNC_RFB_TIMEOUT_MESSAGE_TYPE, retries: 50 });
    expect(parseVncRfbStatusMessage({ type: "other" })).toBeNull();
    expect(parseVncRfbStatusMessage(null)).toBeNull();
  });
});
