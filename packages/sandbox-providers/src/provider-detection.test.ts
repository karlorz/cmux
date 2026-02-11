import { describe, expect, it } from "vitest";
import {
  detectProviderFromInstanceId,
  isMorphInstanceId,
  isPveLxcInstanceId,
  isPveVmInstanceId,
} from "./provider-detection";

describe("provider-detection", () => {
  it("detects pve-lxc instance ids", () => {
    expect(isPveLxcInstanceId("pvelxc-abcd1234")).toBe(true);
    expect(isPveLxcInstanceId("cmux-200")).toBe(true);
    expect(isPveLxcInstanceId("morphvm_foo")).toBe(false);
  });

  it("detects morph instance ids", () => {
    expect(isMorphInstanceId("morphvm_123")).toBe(true);
    expect(isMorphInstanceId("pvelxc-123")).toBe(false);
  });

  it("detects pve-vm instance ids", () => {
    expect(isPveVmInstanceId("pvevm-123")).toBe(true);
    expect(isPveVmInstanceId("pve_vm_123")).toBe(true);
    expect(isPveVmInstanceId("morphvm_123")).toBe(false);
  });

  it("detects providers from instance id prefixes", () => {
    expect(detectProviderFromInstanceId("morphvm_abc")).toBe("morph");
    expect(detectProviderFromInstanceId("pvelxc-abc")).toBe("pve-lxc");
    expect(detectProviderFromInstanceId("cmux-201")).toBe("pve-lxc");
    expect(detectProviderFromInstanceId("pvevm-400")).toBe("pve-vm");
    expect(detectProviderFromInstanceId("random-instance")).toBe("other");
  });
});
