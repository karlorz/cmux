import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Process pending preview screenshot jobs every minute
crons.interval(
  "process-preview-jobs",
  { minutes: 1 },
  internal.preview_worker.processPendingJobs,
  {}
);

export default crons;
