#!/usr/bin/env bash
# setup-ssh-key-auth.sh - Set up SSH key-based authentication for passwordless login
# After setup, use: ssh <host-alias>

set -euo pipefail

readonly DEFAULT_SSH_PORT=22
readonly HOST_ALIAS_PATTERN='^[a-zA-Z0-9_-]+$'
readonly KEY_PREFIX='id_ed25519_'

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

usage() {
    cat << EOF
Usage: $(basename "$0") <host-alias> <user@hostname> [options]

Set up SSH key-based authentication for passwordless login.
By default, prompts for password to automate key installation.

Arguments:
  host-alias              Short alias for the host (e.g., msi-1)
  user@hostname           Remote host in format user@hostname or just hostname

Options:
  -p, --port <port>       SSH port (default: 22)
  -k, --key <path>        Path to existing SSH key to use (will generate if not provided)
  -f, --force             Force recreate SSH config entry if alias exists
  -w, --password <pass>   Provide password directly (skips interactive prompt)
  --no-password           Skip password prompt (if key already installed)
  -h, --help              Show this help message

Examples:
  # Basic setup (prompts for password)
  $(basename "$0") msi-1 karlchow@msi-1.example.com

  # With password provided (no prompt)
  $(basename "$0") msi-1 karlchow@192.168.1.100 --password mypass

  # Skip password (config-only, if key already installed)
  $(basename "$0") msi-1 karlchow@192.168.1.100 --no-password

  # Custom port
  $(basename "$0") msi-1 karlchow@192.168.1.100 --port 2222

  # Use existing key
  $(basename "$0") cloud-server root@cloud.example.com --key ~/.ssh/id_rsa_production

After setup, connect with: ssh msi-1
EOF
}

# Parse arguments
parse_args() {
    if [[ $# -lt 2 ]]; then
        usage
        exit 1
    fi

    HOST_ALIAS="$1"
    REMOTE_TARGET="$2"
    shift 2

    SSH_PORT=$DEFAULT_SSH_PORT
    EXISTING_KEY=""
    FORCE=false
    SSH_PASSWORD=""
    SKIP_PASSWORD=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -p|--port)
                SSH_PORT="$2"
                shift 2
                ;;
            -k|--key)
                EXISTING_KEY="$2"
                shift 2
                ;;
            -f|--force)
                FORCE=true
                shift
                ;;
            -w|--password)
                SSH_PASSWORD="$2"
                shift 2
                ;;
            --no-password)
                SKIP_PASSWORD=true
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done

    if [[ ! "$HOST_ALIAS" =~ $HOST_ALIAS_PATTERN ]]; then
        log_error "Invalid host alias: $HOST_ALIAS"
        log_error "Use only letters, numbers, underscores, and hyphens"
        exit 1
    fi

    # Default behavior: prompt for password unless --no-password or -w specified
    if [[ "$SKIP_PASSWORD" == "false" && -z "$SSH_PASSWORD" ]]; then
        echo -n "Enter remote password (or Ctrl+C and use --no-password if key already installed): "
        read -rs SSH_PASSWORD
        echo ""
    fi
}

# Parse REMOTE_TARGET into REMOTE_USER and REMOTE_HOST
parse_remote_target() {
    if [[ "$REMOTE_TARGET" =~ @ ]]; then
        REMOTE_USER="${REMOTE_TARGET%%@*}"
        REMOTE_HOST="${REMOTE_TARGET#*@}"
    else
        REMOTE_USER="$(whoami)"
        REMOTE_HOST="$REMOTE_TARGET"
    fi
}

# Detect remote OS type via SSH
detect_remote_os() {
    local ssh_opts="$1"
    local os_type="linux"

    # Try to detect Windows
    if [[ -n "${SSH_PASSWORD:-}" ]]; then
        if sshpass -p "$SSH_PASSWORD" ssh $ssh_opts -o PasswordAuthentication=yes -o PreferredAuthentications=password \
            "${REMOTE_USER}@${REMOTE_HOST}" "echo %OS%" 2>/dev/null | grep -q "Windows_NT"; then
            os_type="windows"
        fi
    else
        # Try without password first (if key already exists)
        if ssh $ssh_opts -o BatchMode=yes "${REMOTE_USER}@${REMOTE_HOST}" "echo %OS%" 2>/dev/null | grep -q "Windows_NT"; then
            os_type="windows"
        fi
    fi

    echo "$os_type"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    if ! command -v ssh &>/dev/null; then
        log_info "Installing OpenSSH client..."
        if command -v apt-get &>/dev/null; then
            sudo apt-get update -qq && sudo apt-get install -y -qq openssh-client
        elif command -v yum &>/dev/null; then
            sudo yum install -y openssh-clients
        elif command -v dnf &>/dev/null; then
            sudo dnf install -y openssh-clients
        elif command -v pacman &>/dev/null; then
            sudo pacman -Sy --noconfirm openssh
        elif [[ "$OSTYPE" == "darwin"* ]]; then
            log_info "OpenSSH should be pre-installed on macOS"
        else
            log_error "Could not install OpenSSH client. Please install manually."
            exit 1
        fi
    fi

    if ! command -v ssh-keygen &>/dev/null; then
        log_error "ssh-keygen not found"
        exit 1
    fi

    log_success "Prerequisites OK"
}

# Setup SSH directory
setup_ssh_directory() {
    SSH_DIR="$HOME/.ssh"
    CONFIG_FILE="$SSH_DIR/config"

    log_info "Setting up SSH directory..."

    mkdir -p "$SSH_DIR"
    chmod 700 "$SSH_DIR"

    if [[ ! -f "$CONFIG_FILE" ]]; then
        touch "$CONFIG_FILE"
        chmod 600 "$CONFIG_FILE"
        log_info "Created new SSH config file"
    fi

    log_success "SSH directory ready at $SSH_DIR"
}

# Generate or use existing SSH key
setup_ssh_key() {
    log_info "Setting up SSH key..."

    if [[ -n "$EXISTING_KEY" ]]; then
        if [[ ! -f "$EXISTING_KEY" ]]; then
            log_error "Specified key not found: $EXISTING_KEY"
            exit 1
        fi
        SSH_KEY_PATH="$EXISTING_KEY"
        PUB_KEY_PATH="${EXISTING_KEY}.pub"

        if [[ ! -f "$PUB_KEY_PATH" ]]; then
            log_warn "Public key not found, generating..."
            ssh-keygen -y -f "$SSH_KEY_PATH" > "$PUB_KEY_PATH"
            chmod 644 "$PUB_KEY_PATH"
        fi
        log_success "Using existing SSH key: $SSH_KEY_PATH"
    else
        local key_name="${KEY_PREFIX}${HOST_ALIAS}"
        SSH_KEY_PATH="$SSH_DIR/$key_name"
        PUB_KEY_PATH="${SSH_KEY_PATH}.pub"

        if [[ -f "$SSH_KEY_PATH" ]]; then
            log_warn "Key already exists: $SSH_KEY_PATH"
            log_info "Using existing key (use --key to specify a different one)"
        else
            log_info "Generating new Ed25519 SSH key..."
            ssh-keygen -t ed25519 -a 100 -f "$SSH_KEY_PATH" -N "" -C "$(whoami)@$(hostname)-to-${HOST_ALIAS}"
            log_success "Generated new SSH key: $SSH_KEY_PATH"
        fi
    fi

    chmod 600 "$SSH_KEY_PATH"
    chmod 644 "$PUB_KEY_PATH"

    # Start ssh-agent if not running and cleanup on exit
    if [[ -z "${SSH_AGENT_PID:-}" ]] || ! kill -0 "$SSH_AGENT_PID" 2>/dev/null; then
        eval "$(ssh-agent -s)" >/dev/null
        # shellcheck disable=SC2064
        trap "ssh-agent -k >/dev/null 2>&1 || true" EXIT
    fi

    ssh-add "$SSH_KEY_PATH" 2>/dev/null || log_warn "Could not add key to agent, you may need to run ssh-add manually"
}

# Build common SSH options string
build_ssh_opts() {
    echo "-p $SSH_PORT -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10"
}

# Copy public key to remote Linux/macOS host via sshpass
copy_key_linux() {
    local ssh_opts="$1"
    log_info "Detected Linux/macOS remote host"

    if [[ -n "${SSH_PASSWORD:-}" ]]; then
        log_info "Using sshpass for automated key copy..."

        if ! command -v sshpass &>/dev/null; then
            log_warn "sshpass not installed. Installing..."
            if [[ "$OSTYPE" == "darwin"* ]]; then
                if command -v brew &>/dev/null; then
                    brew install sshpass
                else
                    log_error "Please install sshpass manually: brew install sshpass"
                    return 1
                fi
            elif command -v apt-get &>/dev/null; then
                sudo apt-get update -qq && sudo apt-get install -y -qq sshpass
            elif command -v yum &>/dev/null; then
                sudo yum install -y sshpass
            elif command -v dnf &>/dev/null; then
                sudo dnf install -y sshpass
            else
                log_error "Could not install sshpass. Please install manually."
                return 1
            fi
        fi

        # Create .ssh directory and copy key using sshpass
        if sshpass -p "$SSH_PASSWORD" ssh $ssh_opts -o PasswordAuthentication=yes \
            "${REMOTE_USER}@${REMOTE_HOST}" "mkdir -p ~/.ssh && chmod 700 ~/.ssh"; then

            # Append public key to authorized_keys
            if cat "$PUB_KEY_PATH" | sshpass -p "$SSH_PASSWORD" ssh $ssh_opts -o PasswordAuthentication=yes \
                "${REMOTE_USER}@${REMOTE_HOST}" "cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"; then
                log_success "Public key copied successfully via sshpass"
                return 0
            fi
        fi

        log_error "Failed to copy key using sshpass"
        return 1
    else
        # Try ssh-copy-id with interactive password
        if command -v ssh-copy-id &>/dev/null; then
            if ssh-copy-id $ssh_opts -i "$PUB_KEY_PATH" "${REMOTE_USER}@${REMOTE_HOST}"; then
                log_success "Public key copied successfully via ssh-copy-id"
                return 0
            fi
        fi

        # Fallback: manual copy with interactive prompt
        log_info "ssh-copy-id failed, trying manual copy..."

        if ssh $ssh_opts "${REMOTE_USER}@${REMOTE_HOST}" "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys" < "$PUB_KEY_PATH"; then
            log_success "Public key copied successfully (manual method)"
            return 0
        fi

        return 1
    fi
}

# Copy public key to Windows host
copy_key_windows() {
    local ssh_opts="$1"
    log_info "Detected Windows remote host"

    if [[ -n "${SSH_PASSWORD:-}" ]]; then
        log_info "Using sshpass for automated key copy to Windows..."

        if ! command -v sshpass &>/dev/null; then
            log_warn "sshpass not installed. Cannot automate Windows setup."
            return 1
        fi

        # Windows OpenSSH stores keys in different location
        # Try to create .ssh directory and append key
        local win_user="$REMOTE_USER"

        # Attempt to create directory and copy key via SSH
        if sshpass -p "$SSH_PASSWORD" ssh $ssh_opts -o PasswordAuthentication=yes \
            "${REMOTE_USER}@${REMOTE_HOST}" "powershell -Command \"New-Item -ItemType Directory -Force -Path \\\"C:\\\\Users\\\\$win_user\\\\.ssh\\\"; \$content = Get-Content -Raw -Path \\\"C:\\\\Users\\\\$win_user\\\\.ssh\\\\authorized_keys\\\" -ErrorAction SilentlyContinue; if (\$content -notcontains '$(cat "$PUB_KEY_PATH")') { Add-Content -Path \\\"C:\\\\Users\\\\$win_user\\\\.ssh\\\\authorized_keys\\\" -Value '$(cat "$PUB_KEY_PATH")' }\"" 2>/dev/null; then
            log_success "Public key copied to Windows host"
            return 0
        fi

        log_warn "Automated Windows key copy failed"
    fi

    # Show manual instructions for Windows
    log_warn "Windows requires manual key setup"
    echo ""
    echo "=========================================="
    echo "  Manual Windows Setup Required"
    echo "=========================================="
    echo ""
    echo "1. Copy this public key:"
    cat "$PUB_KEY_PATH"
    echo ""
    echo "2. On Windows (PowerShell as Administrator):"
    echo "   # Create .ssh directory"
    echo "   New-Item -ItemType Directory -Force -Path \"C:\\Users\\$REMOTE_USER\\.ssh\""
    echo ""
    echo "   # Add key to authorized_keys"
    echo "   Add-Content -Path \"C:\\Users\\$REMOTE_USER\\.ssh\\authorized_keys\" -Value '$(cat "$PUB_KEY_PATH")'"
    echo ""
    echo "   # Set permissions (critical!)"
    echo '   icacls "C:\Users\'$REMOTE_USER'\.ssh\authorized_keys" /inheritance:r /grant:r "$($env:USERNAME):(RX)"'
    echo '   icacls "C:\Users\'$REMOTE_USER'\.ssh" /inheritance:r /grant:r "$($env:USERNAME):(RX)"'
    echo ""
    echo "3. Ensure Windows OpenSSH Server is installed and running:"
    echo "   Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH*'"
    echo "   Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0"
    echo "   Start-Service sshd"
    echo "   Set-Service -Name sshd -StartupType 'Automatic'"
    echo ""
    echo "After completing Windows setup, run: ssh $HOST_ALIAS"
    echo ""

    return 1
}

# Copy public key to remote host
copy_public_key() {
    log_info "Copying public key to remote host..."

    local ssh_opts
    ssh_opts=$(build_ssh_opts)

    # Detect remote OS
    REMOTE_OS=$(detect_remote_os "$ssh_opts")
    log_info "Detected remote OS: $REMOTE_OS"

    case "$REMOTE_OS" in
        windows)
            if copy_key_windows "$ssh_opts"; then
                return 0
            else
                # For Windows, don't fail - let user complete manually
                log_warn "Please complete Windows setup manually (see instructions above)"
                return 0
            fi
            ;;
        *)
            if copy_key_linux "$ssh_opts"; then
                return 0
            else
                log_error "Failed to copy public key to remote host"
                log_error "Please manually add this key to ~/.ssh/authorized_keys on the remote host:"
                echo ""
                cat "$PUB_KEY_PATH"
                echo ""
                exit 1
            fi
            ;;
    esac
}

# Add entry to SSH config
update_ssh_config() {
    log_info "Updating SSH config..."

    # Check if alias already exists
    if grep -q "^Host $HOST_ALIAS$" "$CONFIG_FILE"; then
        if [[ "$FORCE" == "true" ]]; then
            log_warn "Host alias '$HOST_ALIAS' already exists, removing old entry..."
            local temp_config
            temp_config=$(mktemp)
            # shellcheck disable=SC2064
            trap "rm -f '$temp_config'" EXIT
            awk -v host="$HOST_ALIAS" '
                /^Host / { in_block = ($2 == host) }
                !in_block { print }
            ' "$CONFIG_FILE" > "$temp_config"
            mv "$temp_config" "$CONFIG_FILE"
            trap - EXIT
        else
            log_error "Host alias '$HOST_ALIAS' already exists in $CONFIG_FILE"
            log_error "Use --force to overwrite, or choose a different alias"
            exit 1
        fi
    fi

    # Add new Host entry
    cat >> "$CONFIG_FILE" << EOF

Host $HOST_ALIAS
    HostName $REMOTE_HOST
    User $REMOTE_USER
    Port $SSH_PORT
    IdentityFile $SSH_KEY_PATH
    IdentitiesOnly yes
    AddKeysToAgent yes
    ServerAliveInterval 60
    ServerAliveCountMax 3
EOF

    chmod 600 "$CONFIG_FILE"
    log_success "SSH config updated: $CONFIG_FILE"
}

# Test the connection
test_connection() {
    log_info "Testing SSH connection to '$HOST_ALIAS'..."

    # For Windows, use the Windows-specific options
    local extra_opts=""
    if [[ "$REMOTE_OS" == "windows" ]]; then
        extra_opts="-o PreferredAuthentications=publickey,password,keyboard-interactive"
    fi

    if ssh -o BatchMode=yes -o ConnectTimeout=10 $extra_opts "$HOST_ALIAS" "echo 'SSH connection successful' && whoami && hostname" 2>/dev/null; then
        log_success "Passwordless SSH connection established!"
        return 0
    else
        # Try with password fallback for Windows
        if [[ "$REMOTE_OS" == "windows" && -n "${SSH_PASSWORD:-}" ]]; then
            log_info "Testing with password fallback (Windows)..."
            if sshpass -p "$SSH_PASSWORD" ssh -o ConnectTimeout=10 "$HOST_ALIAS" "echo 'SSH connection successful (with password)'" 2>/dev/null; then
                log_warn "SSH works but key auth may need manual setup on Windows"
                return 0
            fi
        fi

        log_warn "SSH connection test failed - key may not be installed yet"
        log_info "Troubleshooting tips:"
        log_info "  1. Ensure SSH service is running on the remote host"
        log_info "  2. For Windows: Complete manual setup (see instructions above)"
        log_info "  3. For Linux/macOS: Check ~/.ssh/authorized_keys permissions"
        log_info "  4. Try manually: ssh -v $HOST_ALIAS"
        return 1
    fi
}

# Print summary
print_summary() {
    echo ""
    echo "======================================"
    echo "  SSH Key Authentication Setup Complete"
    echo "======================================"
    echo ""
    echo "Host Alias:    $HOST_ALIAS"
    echo "Remote Host:   $REMOTE_TARGET"
    echo "Remote OS:     ${REMOTE_OS:-unknown}"
    echo "SSH Port:      $SSH_PORT"
    echo "Identity File: $SSH_KEY_PATH"
    echo ""
    echo "Connect with:"
    echo "  ssh $HOST_ALIAS"
    echo ""
    echo "Or with additional options:"
    echo "  ssh $HOST_ALIAS -t 'bash -l'"
    echo "  scp file.txt $HOST_ALIAS:/path/to/destination"
    echo "  rsync -avz ./folder/ $HOST_ALIAS:/path/to/backup/"
    echo ""
    echo "SSH config location: $CONFIG_FILE"
    echo ""
}

# Main
main() {
    parse_args "$@"
    parse_remote_target

    echo ""
    echo "======================================"
    echo "  SSH Key Authentication Setup"
    echo "======================================"
    echo ""
    echo "Host Alias:      $HOST_ALIAS"
    echo "Remote Target:   $REMOTE_TARGET"
    echo "Remote User:     $REMOTE_USER"
    echo "Remote Host:     $REMOTE_HOST"
    echo "SSH Port:        $SSH_PORT"
    echo ""

    check_prerequisites
    setup_ssh_directory
    setup_ssh_key
    copy_public_key
    update_ssh_config
    test_connection || true  # Don't fail on connection test
    print_summary
}

main "$@"
