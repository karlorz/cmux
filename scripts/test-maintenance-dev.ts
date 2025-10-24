#!/usr/bin/env bun

// Test script to verify the maintenance and dev script works
import { $ } from "bun";

const testMaintenanceScript = "echo 'Maintenance script running' && sleep 2 && echo 'Maintenance script completed'";
const testDevScript = "echo 'Dev script running' && sleep 5 && echo 'Dev script should keep running'";

console.log("Testing maintenance and dev script...");
console.log("Maintenance script:", testMaintenanceScript);
console.log("Dev script:", testDevScript);

// Run the test
const result = await $`bun /root/workspace/cmux/scripts/start-maintenance-and-dev.ts ${testMaintenanceScript} ${testDevScript}`;

console.log("Exit code:", result.exitCode);
console.log("Stdout:", result.stdout.toString());
console.log("Stderr:", result.stderr.toString());