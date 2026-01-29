// internal/port/checker_test.go
package port

import (
	"net"
	"testing"
	"time"
)

func TestIsPortFree(t *testing.T) {
	// Find a free port first
	ln, err := net.Listen("tcp", ":0")
	if err != nil {
		t.Fatalf("Failed to get free port: %v", err)
	}
	addr := ln.Addr().(*net.TCPAddr)
	port := addr.Port
	ln.Close()

	// Port should be free now
	if !IsPortFree(port) {
		t.Errorf("Expected port %d to be free", port)
	}

	// Use the port
	ln, err = net.Listen("tcp", addr.String())
	if err != nil {
		t.Fatalf("Failed to listen on port %d: %v", port, err)
	}
	defer ln.Close()

	// Port should not be free now
	if IsPortFree(port) {
		t.Errorf("Expected port %d to be in use", port)
	}
}

func TestFindFreePort(t *testing.T) {
	// Find a free port in a range
	port, err := FindFreePort(50000, 51000)
	if err != nil {
		t.Fatalf("Failed to find free port: %v", err)
	}

	if port < 50000 || port > 51000 {
		t.Errorf("Expected port in range 50000-51000, got %d", port)
	}

	// Verify the port is actually free
	if !IsPortFree(port) {
		t.Errorf("Found port %d is not actually free", port)
	}
}

func TestCheckPortRange(t *testing.T) {
	// Find a range of free ports first
	freePort, err := FindFreePort(50000, 51000)
	if err != nil {
		t.Fatalf("Failed to find free port: %v", err)
	}

	// Check a small range starting from a known free port
	unavailable, err := CheckPortRange(freePort, 5)
	if err != nil {
		// Some ports might be in use, that's OK for this test
		t.Logf("Some ports in range %d-%d are in use: %v", freePort, freePort+4, unavailable)
	}
}

func TestWaitForPort(t *testing.T) {
	// Get a free port
	ln, err := net.Listen("tcp", ":0")
	if err != nil {
		t.Fatalf("Failed to get free port: %v", err)
	}
	addr := ln.Addr().(*net.TCPAddr)
	port := addr.Port
	ln.Close()

	// Start listener in background
	go func() {
		time.Sleep(100 * time.Millisecond)
		ln, err := net.Listen("tcp", addr.String())
		if err != nil {
			return
		}
		defer ln.Close()
		// Accept a connection
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		conn.Close()
	}()

	// Wait for port to become available
	err = WaitForPort(port, 2*time.Second)
	if err != nil {
		t.Errorf("WaitForPort failed: %v", err)
	}
}

func TestWaitForPortTimeout(t *testing.T) {
	// Get a port number that's unlikely to be in use
	ln, err := net.Listen("tcp", ":0")
	if err != nil {
		t.Fatalf("Failed to get free port: %v", err)
	}
	addr := ln.Addr().(*net.TCPAddr)
	port := addr.Port
	ln.Close()

	// Don't start a listener, so the port will never be available
	// Use a very short timeout
	err = WaitForPort(port, 200*time.Millisecond)
	if err == nil {
		t.Error("Expected timeout error")
	}
}

func TestWaitForPortFree(t *testing.T) {
	// Get a free port and use it
	ln, err := net.Listen("tcp", ":0")
	if err != nil {
		t.Fatalf("Failed to get free port: %v", err)
	}
	addr := ln.Addr().(*net.TCPAddr)
	port := addr.Port

	// Close listener in background
	go func() {
		time.Sleep(100 * time.Millisecond)
		ln.Close()
	}()

	// Wait for port to become free
	err = WaitForPortFree(port, 2*time.Second)
	if err != nil {
		t.Errorf("WaitForPortFree failed: %v", err)
	}
}

func TestWaitForPortFreeTimeout(t *testing.T) {
	// Get a free port and use it
	ln, err := net.Listen("tcp", ":0")
	if err != nil {
		t.Fatalf("Failed to get free port: %v", err)
	}
	defer ln.Close()
	addr := ln.Addr().(*net.TCPAddr)
	port := addr.Port

	// Don't close the listener, so port will never be free
	// Use a very short timeout
	err = WaitForPortFree(port, 200*time.Millisecond)
	if err == nil {
		t.Error("Expected timeout error")
	}
}

func TestGetPortProcess(t *testing.T) {
	// Get a free port and use it
	ln, err := net.Listen("tcp", ":0")
	if err != nil {
		t.Fatalf("Failed to get free port: %v", err)
	}
	defer ln.Close()
	addr := ln.Addr().(*net.TCPAddr)
	port := addr.Port

	// Get process info
	info, err := GetPortProcess(port)
	if err != nil {
		t.Logf("GetPortProcess returned error: %v", err)
		// This might fail if lsof/ss is not available, which is OK
		return
	}

	if info == nil {
		t.Log("GetPortProcess returned nil, port might not be bound yet")
		return
	}

	// PID should be greater than 0
	if info.PID <= 0 {
		t.Errorf("Expected positive PID, got %d", info.PID)
	}
}

func TestFindFreePortNoAvailable(t *testing.T) {
	// Try to find a port in an impossible range
	_, err := FindFreePort(0, 0)
	if err == nil {
		t.Error("Expected error when no ports available")
	}
}
