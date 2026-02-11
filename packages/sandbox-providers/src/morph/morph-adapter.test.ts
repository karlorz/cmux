import { describe, expect, it, vi } from "vitest";
import {
  type MorphLikeInstance,
  wrapMorphInstance,
} from "./morph-adapter";

describe("wrapMorphInstance", () => {
  it("adapts morph instances to SandboxInstance", async () => {
    const execMock = vi.fn(async () => ({
      exit_code: 0,
      stdout: "ok",
      stderr: "",
    }));
    const stopMock = vi.fn(async () => {});
    const pauseMock = vi.fn(async () => {});
    const resumeMock = vi.fn(async () => {});
    const exposeMock = vi.fn(async () => {});
    const hideMock = vi.fn(async () => {});
    const wakeOnMock = vi.fn(async () => {});

    const instance: MorphLikeInstance = {
      id: "morphvm_test",
      status: "running",
      metadata: { teamId: "team-1" },
      networking: {
        httpServices: [{ name: "vscode", port: 39378, url: "https://vscode" }],
      },
      exec: execMock,
      stop: stopMock,
      pause: pauseMock,
      resume: resumeMock,
      exposeHttpService: exposeMock,
      hideHttpService: hideMock,
      setWakeOn: wakeOnMock,
    };

    const wrapped = wrapMorphInstance(instance);

    expect(wrapped.id).toBe("morphvm_test");
    expect(wrapped.networking.httpServices[0]?.port).toBe(39378);

    const result = await wrapped.exec("echo hi", { timeoutMs: 1100 });
    expect(result.exit_code).toBe(0);
    expect(execMock).toHaveBeenCalledWith("echo hi", { timeout: 2 });

    await wrapped.stop();
    await wrapped.pause();
    await wrapped.resume();
    await wrapped.exposeHttpService("web", 3000);
    await wrapped.hideHttpService("web");
    await wrapped.setWakeOn(true, true);

    expect(stopMock).toHaveBeenCalledTimes(1);
    expect(pauseMock).toHaveBeenCalledTimes(1);
    expect(resumeMock).toHaveBeenCalledTimes(1);
    expect(exposeMock).toHaveBeenCalledWith("web", 3000);
    expect(hideMock).toHaveBeenCalledWith("web");
    expect(wakeOnMock).toHaveBeenCalledWith(true, true);
  });
});
