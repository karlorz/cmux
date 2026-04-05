import { describe, expect, it } from "vitest";
import {
  deriveLocalRunControlState,
  RUN_CONTROL_ACTION_LABELS,
  RUN_CONTROL_DEFAULT_INSTRUCTIONS,
  RunControlActionSchema,
} from "./run-control-types";

describe("run-control-types", () => {
  it("exposes labels for every run-control action", () => {
    const actions = RunControlActionSchema.options;

    expect(Object.keys(RUN_CONTROL_ACTION_LABELS).sort()).toEqual([...actions].sort());
    expect(RUN_CONTROL_ACTION_LABELS.continue_session).toBe("Continue session");
    expect(RUN_CONTROL_ACTION_LABELS.resume_checkpoint).toBe("Resume checkpoint");
    expect(RUN_CONTROL_ACTION_LABELS.append_instruction).toBe("Append instruction");
    expect(RUN_CONTROL_ACTION_LABELS.resolve_approval).toBe("Resolve approval");
  });

  it("derives local run-control state consistently", () => {
    expect(
      deriveLocalRunControlState({
        sessionId: "session_123",
      }),
    ).toMatchObject({
      normalizedStatus: "running",
      runStatus: "running",
      lifecycleStatus: "active",
      interruptionStatus: "none",
      continuationMode: "session_continuation",
      availableActions: ["continue_session"],
      canContinueSession: true,
      canResumeCheckpoint: false,
      canAppendInstruction: false,
    });

    expect(
      deriveLocalRunControlState({
        checkpointRef: "cp_123",
      }),
    ).toMatchObject({
      continuationMode: "checkpoint_restore",
      interruptionStatus: "checkpoint_pending",
      availableActions: ["resume_checkpoint"],
      canContinueSession: false,
      canResumeCheckpoint: true,
      canAppendInstruction: false,
    });

    expect(
      deriveLocalRunControlState({
        status: "running",
      }),
    ).toMatchObject({
      continuationMode: "append_instruction",
      availableActions: ["append_instruction"],
      canAppendInstruction: true,
    });

    expect(
      deriveLocalRunControlState({
        status: "completed",
        sessionId: "session_123",
      }),
    ).toMatchObject({
      runStatus: "completed",
      lifecycleStatus: "completed",
      continuationMode: "none",
      availableActions: [],
      canContinueSession: false,
      canResumeCheckpoint: false,
      canAppendInstruction: false,
    });
  });
});
