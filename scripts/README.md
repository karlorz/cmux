# Maintenance and Dev Script Manager

This script replaces the previous approach of running maintenance and dev scripts with separate `instance.exec` calls. Instead, it uses a single `instance.exec` call to manage both scripts in separate tmux windows, preventing Vercel function timeouts.

## Features

- **Single instance.exec call**: Prevents Vercel function timeouts by executing both scripts in one command
- **Sequential execution**: Maintenance script runs first, then dev script starts in a separate tmux window
- **Error logging**: All errors are logged to `/var/log/cmux/maintenance-dev-script.log`
- **Tmux window management**: Creates separate tmux windows for maintenance and dev scripts
- **Robust error handling**: Comprehensive error catching and reporting

## Usage

The script is called from `startDevAndMaintenanceScript.ts` with the following parameters:

```bash
bun /root/workspace/cmux/scripts/start-maintenance-and-dev.ts [maintenance_script] [dev_script]
```

### Parameters

- `maintenance_script`: The maintenance script to execute (optional)
- `dev_script`: The development script to execute (optional)

## How It Works

1. **Script Creation**: Creates a combined shell script that handles both maintenance and dev execution
2. **Tmux Session Check**: Verifies the tmux session exists before proceeding
3. **Maintenance Execution**: 
   - Creates a maintenance window in the tmux session
   - Runs the maintenance script
   - Waits for completion before proceeding
4. **Dev Execution**:
   - Creates a dev window in the tmux session  
   - Starts the dev script (which runs continuously)
5. **Error Logging**: All operations and errors are logged to `/var/log/cmux/maintenance-dev-script.log`

## Error Handling

The script includes comprehensive error handling:
- Checks for tmux session availability
- Validates script execution success
- Logs all errors with timestamps
- Provides meaningful error messages for debugging

## Log Location

All script execution logs are stored in:
- `/var/log/cmux/maintenance-dev-script.log`

This location was chosen to align with existing cmux logging practices.

## Migration from Previous Implementation

The previous implementation used separate `instance.exec` calls for maintenance and dev scripts, which could cause Vercel function timeouts. This new approach:

1. **Consolidates execution**: Uses a single `instance.exec` call
2. **Maintains functionality**: Preserves all original behavior
3. **Improves reliability**: Better error handling and logging
4. **Prevents timeouts**: Single execution call avoids Vercel function timeout issues

## Testing

A test script is available at `/root/workspace/cmux/scripts/test-maintenance-dev.ts` for verifying functionality.