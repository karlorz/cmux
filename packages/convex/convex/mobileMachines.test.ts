import { describe, expect, it } from "vitest";
import {
  MACHINE_HEARTBEAT_STALE_MS,
  resolveMachineStatus,
  buildMachineList,
} from "./mobileMachines";

// Minimal mock type matching the function signatures
type MockMachine = {
  machineId: string;
  status: "online" | "offline" | "unknown";
  lastSeenAt: number;
  [key: string]: unknown;
};

describe("mobileMachines", () => {
  describe("MACHINE_HEARTBEAT_STALE_MS", () => {
    it("is 120 seconds (2 minutes)", () => {
      expect(MACHINE_HEARTBEAT_STALE_MS).toBe(120_000);
    });
  });

  describe("resolveMachineStatus", () => {
    const NOW = 1000000;

    it("returns 'offline' for offline machines regardless of lastSeenAt", () => {
      const machine = { status: "offline" as const, lastSeenAt: NOW };
      expect(resolveMachineStatus(machine, NOW)).toBe("offline");
    });

    it("returns 'unknown' for unknown machines regardless of lastSeenAt", () => {
      const machine = { status: "unknown" as const, lastSeenAt: NOW };
      expect(resolveMachineStatus(machine, NOW)).toBe("unknown");
    });

    it("returns 'online' for online machines with recent heartbeat", () => {
      const machine = {
        status: "online" as const,
        lastSeenAt: NOW - MACHINE_HEARTBEAT_STALE_MS + 1000, // 1 second before stale
      };
      expect(resolveMachineStatus(machine, NOW)).toBe("online");
    });

    it("returns 'offline' for online machines with stale heartbeat", () => {
      const machine = {
        status: "online" as const,
        lastSeenAt: NOW - MACHINE_HEARTBEAT_STALE_MS - 1, // 1ms past stale threshold
      };
      expect(resolveMachineStatus(machine, NOW)).toBe("offline");
    });

    it("returns 'online' for machine seen exactly at stale threshold", () => {
      const machine = {
        status: "online" as const,
        lastSeenAt: NOW - MACHINE_HEARTBEAT_STALE_MS, // exactly at threshold
      };
      // At exactly threshold, (NOW - lastSeenAt) === MACHINE_HEARTBEAT_STALE_MS
      // which is NOT > MACHINE_HEARTBEAT_STALE_MS, so still online
      expect(resolveMachineStatus(machine, NOW)).toBe("online");
    });

    it("returns 'online' for machine seen just now", () => {
      const machine = { status: "online" as const, lastSeenAt: NOW };
      expect(resolveMachineStatus(machine, NOW)).toBe("online");
    });

    it("uses Date.now() by default", () => {
      const now = Date.now();
      const machine = { status: "online" as const, lastSeenAt: now };
      expect(resolveMachineStatus(machine)).toBe("online");
    });
  });

  describe("buildMachineList", () => {
    const NOW = 1000000;

    it("returns empty array for empty input", () => {
      const result = buildMachineList([], NOW);
      expect(result).toEqual([]);
    });

    it("resolves status for each machine", () => {
      const machines: MockMachine[] = [
        {
          machineId: "m-1",
          status: "online",
          lastSeenAt: NOW - MACHINE_HEARTBEAT_STALE_MS - 1000, // stale
        },
        {
          machineId: "m-2",
          status: "online",
          lastSeenAt: NOW - 1000, // recent
        },
      ];
      const result = buildMachineList(machines as never[], NOW);

      expect(result.find((m) => m.machineId === "m-1")?.status).toBe("offline");
      expect(result.find((m) => m.machineId === "m-2")?.status).toBe("online");
    });

    it("sorts machines by lastSeenAt descending (most recent first)", () => {
      const machines: MockMachine[] = [
        { machineId: "old", status: "online", lastSeenAt: 100 },
        { machineId: "new", status: "online", lastSeenAt: 300 },
        { machineId: "mid", status: "online", lastSeenAt: 200 },
      ];
      const result = buildMachineList(machines as never[], NOW);

      expect(result[0].machineId).toBe("new");
      expect(result[1].machineId).toBe("mid");
      expect(result[2].machineId).toBe("old");
    });

    it("preserves all original machine properties", () => {
      const machines: MockMachine[] = [
        {
          machineId: "m-1",
          status: "online",
          lastSeenAt: NOW,
          displayName: "My Machine",
          tailscaleHostname: "my-machine.ts.net",
        },
      ];
      const result = buildMachineList(machines as never[], NOW);

      expect(result[0].displayName).toBe("My Machine");
      expect(result[0].tailscaleHostname).toBe("my-machine.ts.net");
    });

    it("does not mutate input array", () => {
      const machines: MockMachine[] = [
        { machineId: "m-2", status: "online", lastSeenAt: 100 },
        { machineId: "m-1", status: "online", lastSeenAt: 200 },
      ];
      const originalOrder = machines.map((m) => m.machineId);

      buildMachineList(machines as never[], NOW);

      expect(machines.map((m) => m.machineId)).toEqual(originalOrder);
    });

    it("handles mixed status machines", () => {
      const machines: MockMachine[] = [
        { machineId: "online", status: "online", lastSeenAt: NOW },
        { machineId: "offline", status: "offline", lastSeenAt: NOW },
        { machineId: "unknown", status: "unknown", lastSeenAt: NOW },
      ];
      const result = buildMachineList(machines as never[], NOW);

      expect(result.find((m) => m.machineId === "online")?.status).toBe("online");
      expect(result.find((m) => m.machineId === "offline")?.status).toBe("offline");
      expect(result.find((m) => m.machineId === "unknown")?.status).toBe("unknown");
    });

    it("uses Date.now() by default", () => {
      const now = Date.now();
      const machines: MockMachine[] = [
        { machineId: "m-1", status: "online", lastSeenAt: now },
      ];
      const result = buildMachineList(machines as never[]);

      expect(result[0].status).toBe("online");
    });
  });
});
