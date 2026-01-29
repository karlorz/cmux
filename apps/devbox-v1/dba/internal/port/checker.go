// internal/port/checker.go
package port

import (
	"fmt"
	"net"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// IsPortFree checks if a port is free to use
func IsPortFree(port int) bool {
	addr := fmt.Sprintf(":%d", port)
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return false
	}
	ln.Close()
	return true
}

// GetPortProcess returns info about what's using a port
func GetPortProcess(port int) (*ProcessInfo, error) {
	if runtime.GOOS == "darwin" {
		return getPortProcessMacOS(port)
	}
	return getPortProcessLinux(port)
}

// ProcessInfo contains information about a process using a port
type ProcessInfo struct {
	PID     int    `json:"pid"`
	Process string `json:"process"`
	User    string `json:"user,omitempty"`
}

func getPortProcessMacOS(port int) (*ProcessInfo, error) {
	// Use lsof to find what's using the port
	cmd := exec.Command("lsof", "-i", fmt.Sprintf(":%d", port), "-P", "-n", "-t")
	output, err := cmd.Output()
	if err != nil {
		return nil, nil // Port is free
	}

	pidStr := strings.TrimSpace(string(output))
	if pidStr == "" {
		return nil, nil
	}

	// Get the first PID if multiple are returned
	pids := strings.Split(pidStr, "\n")
	pid, err := strconv.Atoi(pids[0])
	if err != nil {
		return nil, nil
	}

	// Get process name
	cmd = exec.Command("ps", "-p", strconv.Itoa(pid), "-o", "comm=")
	output, _ = cmd.Output()
	processName := strings.TrimSpace(string(output))

	return &ProcessInfo{
		PID:     pid,
		Process: processName,
	}, nil
}

func getPortProcessLinux(port int) (*ProcessInfo, error) {
	// Try ss first (preferred on modern Linux)
	cmd := exec.Command("ss", "-tlnp", fmt.Sprintf("sport = :%d", port))
	output, err := cmd.Output()
	if err == nil {
		return parseSSOutput(string(output), port)
	}

	// Try netstat as fallback
	cmd = exec.Command("netstat", "-tlnp")
	output, err = cmd.Output()
	if err != nil {
		return nil, nil
	}

	return parseNetstatOutput(string(output), port)
}

func parseSSOutput(output string, port int) (*ProcessInfo, error) {
	lines := strings.Split(output, "\n")
	portStr := fmt.Sprintf(":%d", port)

	for _, line := range lines {
		if strings.Contains(line, portStr) {
			// Format: LISTEN 0 128 *:port *:* users:(("process",pid=XXX,fd=YY))
			// Extract PID from the line
			if idx := strings.Index(line, "pid="); idx != -1 {
				pidPart := line[idx+4:]
				if endIdx := strings.IndexAny(pidPart, ",)"); endIdx != -1 {
					pidStr := pidPart[:endIdx]
					pid, err := strconv.Atoi(pidStr)
					if err == nil {
						// Extract process name
						if startIdx := strings.Index(line, "((\""); startIdx != -1 {
							namePart := line[startIdx+3:]
							if endIdx := strings.Index(namePart, "\""); endIdx != -1 {
								return &ProcessInfo{
									PID:     pid,
									Process: namePart[:endIdx],
								}, nil
							}
						}
						return &ProcessInfo{
							PID:     pid,
							Process: "unknown",
						}, nil
					}
				}
			}
		}
	}

	return nil, nil
}

func parseNetstatOutput(output string, port int) (*ProcessInfo, error) {
	lines := strings.Split(output, "\n")
	portStr := fmt.Sprintf(":%d", port)

	for _, line := range lines {
		if strings.Contains(line, portStr) && strings.Contains(line, "LISTEN") {
			// Format varies by system, try to extract PID/program
			fields := strings.Fields(line)
			if len(fields) >= 7 {
				pidProgram := fields[len(fields)-1]
				parts := strings.Split(pidProgram, "/")
				if len(parts) >= 2 {
					pid, err := strconv.Atoi(parts[0])
					if err == nil {
						return &ProcessInfo{
							PID:     pid,
							Process: parts[1],
						}, nil
					}
				}
			}
		}
	}

	return nil, nil
}

// WaitForPort waits for a port to become available (something is listening)
func WaitForPort(port int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", fmt.Sprintf("localhost:%d", port), 100*time.Millisecond)
		if err == nil {
			conn.Close()
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}

	return fmt.Errorf("port %d not available after %s", port, timeout)
}

// WaitForPortFree waits for a port to become free
func WaitForPortFree(port int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		if IsPortFree(port) {
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}

	return fmt.Errorf("port %d still in use after %s", port, timeout)
}

// CheckPortRange checks if a range of ports is available
func CheckPortRange(start, count int) ([]int, error) {
	var unavailable []int
	for port := start; port < start+count; port++ {
		if !IsPortFree(port) {
			unavailable = append(unavailable, port)
		}
	}
	if len(unavailable) > 0 {
		return unavailable, fmt.Errorf("%d ports in range %d-%d are in use",
			len(unavailable), start, start+count-1)
	}
	return nil, nil
}

// FindFreePort finds a free port in the given range
func FindFreePort(start, end int) (int, error) {
	if start > end || start < MinPort || end > MaxPort {
		return 0, fmt.Errorf("invalid port range %d-%d (valid range: %d-%d)", start, end, MinPort, MaxPort)
	}
	for port := start; port <= end; port++ {
		if IsPortFree(port) {
			return port, nil
		}
	}
	return 0, fmt.Errorf("no free port in range %d-%d", start, end)
}
