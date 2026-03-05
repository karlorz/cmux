#!/usr/bin/env bash
# pve-validate-snapshot.sh - Validate a PVE LXC template snapshot
# Usage: ./pve-validate-snapshot.sh <template-vmid>
#
# Clones a template, starts the clone, validates network config and critical
# tools, then cleans up. Follows the same pattern as pve-test-template.sh.
#
# Exit codes:
#   0 - All validations passed
#   1 - Validation failure (network config or tools)
#   2 - Infrastructure error (clone/start/connectivity)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/pve-api.sh"

DEFAULT_TEMPLATE_VMID="${PVE_TEMPLATE_VMID:-9000}"

usage() {
    cat << EOF
Usage: $(basename "$0") <template-vmid>

Validates a PVE LXC template snapshot by:
  1. Cloning the template to a temporary container
  2. Starting the container
  3. Validating network configuration (DHCPv4 drop-in)
  4. Verifying installed tools (node, bun, uv, docker)
  5. Cleaning up (stop + delete)

Arguments:
  template-vmid   Template VMID to validate (default: ${DEFAULT_TEMPLATE_VMID})

Exit codes:
  0 - All validations passed
  1 - Validation failure
  2 - Infrastructure error

Examples:
  $(basename "$0")           # Validate template ${DEFAULT_TEMPLATE_VMID}
  $(basename "$0") 9001      # Validate template 9001
EOF
}

# Global vars for cleanup trap
TEST_VMID=""
TEST_NODE=""

cleanup() {
    if [[ -n "$TEST_VMID" && -n "$TEST_NODE" ]]; then
        log_info "Cleaning up validation container ${TEST_VMID}..."
        pve_lxc_stop "$TEST_VMID" "$TEST_NODE" 2>/dev/null || true
        sleep 2
        pve_lxc_delete "$TEST_VMID" "$TEST_NODE" 2>/dev/null || true
        log_success "Cleanup complete"
    fi
}
trap cleanup EXIT

main() {
    local template_vmid="${1:-$DEFAULT_TEMPLATE_VMID}"

    if [[ "$template_vmid" == "-h" || "$template_vmid" == "--help" ]]; then
        usage
        exit 0
    fi

    TEST_NODE=$(pve_get_default_node)

    # Find next available VMID for validation container
    TEST_VMID=$(pve_api GET "/api2/json/cluster/nextid" | jq -r '.data')

    log_info "Validating template ${template_vmid} on node ${TEST_NODE}"
    log_info "Validation container VMID: ${TEST_VMID}"
    echo ""

    # 1. Clone template
    log_info "[1/5] Cloning template ${template_vmid} to ${TEST_VMID}..."
    local clone_result
    clone_result=$(pve_lxc_clone "$template_vmid" "$TEST_VMID" "$TEST_NODE") || {
        log_error "Failed to clone template ${template_vmid}"
        exit 2
    }
    local upid
    upid=$(echo "$clone_result" | jq -r '.data // empty')
    if [[ -n "$upid" ]]; then
        pve_wait_task "$upid" 300 "$TEST_NODE" || {
            log_error "Clone task timed out"
            exit 2
        }
    fi

    # 2. Start container
    log_info "[2/5] Starting validation container..."
    local start_result
    start_result=$(pve_lxc_start "$TEST_VMID" "$TEST_NODE") || {
        log_error "Failed to start container ${TEST_VMID}"
        exit 2
    }
    upid=$(echo "$start_result" | jq -r '.data // empty')
    if [[ -n "$upid" ]]; then
        pve_wait_task "$upid" 60 "$TEST_NODE" || {
            log_error "Start task timed out"
            exit 2
        }
    fi
    sleep 3

    local pve_ssh_host="root@$(echo "${PVE_API_URL}" | sed -E 's|https?://([^:/]+).*|\1|')"

    local failed=0

    # Helper: run command in container via SSH+pct exec
    run_in_ct() {
        local cmd="$1"
        ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$pve_ssh_host" \
            "pct exec ${TEST_VMID} -- bash -c '$cmd'" 2>/dev/null
    }

    # 3. Validate network configuration
    log_info "[3/5] Validating network configuration..."
    echo ""

    # Check drop-in file exists
    if run_in_ct "test -f /etc/systemd/network/eth0.network.d/50-cmux-dhcp.conf"; then
        echo "  [OK] DHCPv4 drop-in file exists"
    else
        echo "  [FAIL] DHCPv4 drop-in file missing: /etc/systemd/network/eth0.network.d/50-cmux-dhcp.conf"
        failed=1
    fi

    # Check drop-in contains SendHostname=yes
    if run_in_ct "grep -q 'SendHostname=yes' /etc/systemd/network/eth0.network.d/50-cmux-dhcp.conf"; then
        echo "  [OK] SendHostname=yes configured"
    else
        echo "  [FAIL] SendHostname=yes not found in drop-in"
        failed=1
    fi

    # Check drop-in contains UseDNS=no
    if run_in_ct "grep -q 'UseDNS=no' /etc/systemd/network/eth0.network.d/50-cmux-dhcp.conf"; then
        echo "  [OK] UseDNS=no configured"
    else
        echo "  [FAIL] UseDNS=no not found in drop-in"
        failed=1
    fi

    # Check systemd-networkd is active
    local networkd_status
    if networkd_status=$(run_in_ct "systemctl is-active systemd-networkd"); then
        if [[ "$networkd_status" == "active" ]]; then
            echo "  [OK] systemd-networkd: active"
        else
            echo "  [WARN] systemd-networkd: ${networkd_status}"
        fi
    else
        echo "  [FAIL] systemd-networkd: not running"
        failed=1
    fi

    echo ""

    # 4. Verify installed tools (same checks as pve-test-template.sh)
    log_info "[4/5] Verifying installed tools..."
    echo ""

    check_tool() {
        local name="$1"
        local cmd="$2"
        local result
        if result=$(ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$pve_ssh_host" \
            "pct exec ${TEST_VMID} -- $cmd" 2>/dev/null); then
            echo "  [OK] $name: $result"
        else
            echo "  [FAIL] $name: not found or error"
            failed=1
        fi
    }

    check_tool "Node.js" "node --version"
    check_tool "Bun" "/usr/local/bin/bun --version"
    check_tool "uv" "/usr/local/bin/uv --version"
    check_tool "Docker" "docker --version"

    echo ""

    # 5. Results
    log_info "[5/5] Validation results"
    if [[ $failed -eq 0 ]]; then
        log_success "All validations passed for template ${template_vmid}"
        echo ""
        echo "Template ${template_vmid} is validated and ready for use."
    else
        log_error "Validation FAILED for template ${template_vmid}"
        echo ""
        echo "Template has issues that need to be resolved."
        echo "Run pve-diagnose-network.sh for detailed diagnostics."
        exit 1
    fi
}

main "$@"
