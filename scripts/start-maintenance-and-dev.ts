#!/usr/bin/env bun

import { $ } from "bun";

const WORKSPACE_ROOT = "/root/workspace";
const CMUX_RUNTIME_DIR = "/var/tmp/cmux-scripts";
const LOG_DIR = "/var/log/cmux";
const LOG_FILE = `${LOG_DIR}/maintenance-dev-script.log`;

// Ensure log directory exists
await $`mkdir -p ${LOG_DIR}`.quiet();

// Logging function
async function log(message: string, isError = false) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  
  // Write to log file
  await Bun.write(LOG_FILE, logMessage, { append: true });
  
  // Also output to console for visibility
  if (isError) {
    console.error(logMessage.trim());
  } else {
    console.log(logMessage.trim());
  }
}

// Main script execution
async function main() {
  try {
    await log("Starting maintenance and dev script manager");
    
    // Get scripts from command line arguments
    const maintenanceScript = process.argv[2];
    const devScript = process.argv[3];
    
    if (!maintenanceScript && !devScript) {
      await log("Error: Both maintenance and dev scripts are empty", true);
      process.exit(1);
    }
    
    // Create the combined script content
    const combinedScriptContent = `#!/bin/zsh
set -eux
cd ${WORKSPACE_ROOT}

# Function to log errors to file
log_error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >> ${LOG_FILE}
}

# Function to log info to file
log_info() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: $1" >> ${LOG_FILE}
}

log_info "Starting combined maintenance and dev script execution"

# Ensure tmux session exists
log_info "Waiting for tmux session to be available..."
for i in {1..20}; do
  if tmux has-session -t cmux 2>/dev/null; then
    break
  fi
  sleep 0.5
done

if ! tmux has-session -t cmux 2>/dev/null; then
  log_error "cmux session does not exist"
  echo "Error: cmux session does not exist" >&2
  exit 1
fi

log_info "Tmux session 'cmux' is available"

# Maintenance script execution
${maintenanceScript ? `
log_info "Starting maintenance script"
echo "=== Maintenance Script Started at $(date) ==="

# Create maintenance script file
cat > ${CMUX_RUNTIME_DIR}/maintenance.sh <<'MAINTENANCE_EOF'
#!/bin/zsh
set -eux
cd ${WORKSPACE_ROOT}

echo "=== Maintenance Script Started at \$(date) ==="
${maintenanceScript}
echo "=== Maintenance Script Completed at \$(date) ==="
MAINTENANCE_EOF

chmod +x ${CMUX_RUNTIME_DIR}/maintenance.sh

# Create maintenance window and run script
log_info "Creating maintenance window"
tmux new-window -t cmux: -n maintenance -d "zsh ${CMUX_RUNTIME_DIR}/maintenance.sh"

# Wait for maintenance script to complete
log_info "Waiting for maintenance script to complete"
while tmux list-windows -t cmux 2>/dev/null | grep -q "maintenance"; do
  sleep 1
done

log_info "Maintenance script completed"
` : 'log_info "No maintenance script provided, skipping"'}

# Dev script execution
${devScript ? `
log_info "Starting dev script"
echo "=== Dev Script Started at $(date) ==="

# Create dev script file
cat > ${CMUX_RUNTIME_DIR}/dev.sh <<'DEV_EOF'
#!/bin/zsh
set -ux
cd ${WORKSPACE_ROOT}

echo "=== Dev Script Started at \$(date) ==="
${devScript}
DEV_EOF

chmod +x ${CMUX_RUNTIME_DIR}/dev.sh

# Create dev window and run script
log_info "Creating dev window"
tmux new-window -t cmux: -n dev -d
tmux send-keys -t cmux:dev "zsh ${CMUX_RUNTIME_DIR}/dev.sh" C-m

# Verify dev window is running
sleep 2
if tmux list-windows -t cmux 2>/dev/null | grep -q "dev"; then
  log_info "Dev window is running successfully"
else
  log_error "Dev window failed to start"
  echo "Error: Dev window failed to start" >&2
  exit 1
fi
` : 'log_info "No dev script provided, skipping"'}

log_info "Combined script execution completed successfully"
echo "=== All Scripts Started at $(date) ==="
`;

    // Write the combined script to a temporary file
    const scriptPath = `${CMUX_RUNTIME_DIR}/combined-maintenance-dev.sh`;
    await $`mkdir -p ${CMUX_RUNTIME_DIR}`.quiet();
    await Bun.write(scriptPath, combinedScriptContent);
    await $`chmod +x ${scriptPath}`.quiet();
    
    await log("Executing combined maintenance and dev script");
    
    // Execute the combined script
    const result = await $`zsh ${scriptPath}`.quiet();
    
    if (result.exitCode !== 0) {
      await log(`Script execution failed with exit code ${result.exitCode}`, true);
      await log(`Error output: ${result.stderr.toString()}`, true);
      process.exit(result.exitCode);
    }
    
    await log("Combined maintenance and dev script execution completed successfully");
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await log(`Unexpected error: ${errorMessage}`, true);
    process.exit(1);
  }
}

// Run the main function
main();