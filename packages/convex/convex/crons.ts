import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Sandbox instance lifecycle maintenance (all providers: morph, pve-lxc, docker, daytona)
// Runs daily at 12:00 UTC (4 AM PST / 5 AM PDT)
crons.daily(
  "pause old sandbox instances",
  { hourUTC: 12, minuteUTC: 0 },
  internal.sandboxInstanceMaintenance.pauseOldSandboxInstances
);

// Stop inactive sandbox instances (paused for >14 days)
// Runs daily at 13:00 UTC (5 AM PST / 6 AM PDT)
crons.daily(
  "stop old sandbox instances",
  { hourUTC: 13, minuteUTC: 0 },
  internal.sandboxInstanceMaintenance.stopOldSandboxInstances
);

export default crons;
