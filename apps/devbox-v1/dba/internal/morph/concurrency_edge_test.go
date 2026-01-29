// internal/morph/concurrency_edge_test.go
// Comprehensive concurrency edge case tests
package morph

import (
	"context"
	"fmt"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// TestConcurrency_ManyGoroutines tests with many concurrent goroutines
func TestConcurrency_ManyGoroutines(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Pre-populate
	for i := 0; i < 100; i++ {
		manager.SetInstance(fmt.Sprintf("ws%d", i), &Instance{
			ID:     fmt.Sprintf("inst_%d", i),
			Status: StatusRunning,
		})
	}

	numGoroutines := 1000
	var wg sync.WaitGroup
	errors := make(chan error, numGoroutines)

	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			wsID := fmt.Sprintf("ws%d", idx%100)

			// Random operations
			switch idx % 4 {
			case 0:
				_ = manager.IsRunning(wsID)
			case 1:
				_ = manager.GetInstanceByID(fmt.Sprintf("inst_%d", idx%100))
			case 2:
				_ = manager.ListInstances()
			case 3:
				manager.SetInstance(wsID, &Instance{
					ID:     fmt.Sprintf("inst_%d", idx%100),
					Status: StatusRunning,
				})
			}
		}(i)
	}

	wg.Wait()
	close(errors)

	for err := range errors {
		t.Error(err)
	}
}

// TestConcurrency_ReadHeavy tests read-heavy workload
func TestConcurrency_ReadHeavy(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Pre-populate
	for i := 0; i < 10; i++ {
		manager.SetInstance(fmt.Sprintf("ws%d", i), &Instance{
			ID:     fmt.Sprintf("inst_%d", i),
			Status: StatusRunning,
		})
	}

	var wg sync.WaitGroup
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	reads := int64(0)
	writes := int64(0)

	// 90% readers, 10% writers
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				default:
					if idx < 90 {
						// Reader
						_ = manager.IsRunning(fmt.Sprintf("ws%d", idx%10))
						atomic.AddInt64(&reads, 1)
					} else {
						// Writer
						manager.SetInstance(fmt.Sprintf("ws%d", idx%10), &Instance{
							ID:     fmt.Sprintf("inst_%d", idx%10),
							Status: StatusRunning,
						})
						atomic.AddInt64(&writes, 1)
					}
				}
			}
		}(i)
	}

	wg.Wait()
	t.Logf("Read-heavy: %d reads, %d writes", reads, writes)
}

// TestConcurrency_WriteHeavy tests write-heavy workload
func TestConcurrency_WriteHeavy(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	var wg sync.WaitGroup
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	reads := int64(0)
	writes := int64(0)

	// 10% readers, 90% writers
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				default:
					if idx < 10 {
						// Reader
						_ = manager.ListInstances()
						atomic.AddInt64(&reads, 1)
					} else {
						// Writer
						manager.SetInstance(fmt.Sprintf("ws%d", idx%50), &Instance{
							ID:     fmt.Sprintf("inst_%d", idx%50),
							Status: StatusRunning,
						})
						atomic.AddInt64(&writes, 1)
					}
				}
			}
		}(i)
	}

	wg.Wait()
	t.Logf("Write-heavy: %d reads, %d writes", reads, writes)
}

// TestConcurrency_AllReaders tests all-reader workload (should not block)
func TestConcurrency_AllReaders(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Pre-populate
	for i := 0; i < 10; i++ {
		manager.SetInstance(fmt.Sprintf("ws%d", i), &Instance{
			ID:     fmt.Sprintf("inst_%d", i),
			Status: StatusRunning,
		})
	}

	var wg sync.WaitGroup
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	reads := int64(0)

	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				default:
					_ = manager.IsRunning(fmt.Sprintf("ws%d", idx%10))
					_ = manager.GetInstanceByID(fmt.Sprintf("inst_%d", idx%10))
					_ = manager.ListInstances()
					atomic.AddInt64(&reads, 3)
				}
			}
		}(i)
	}

	wg.Wait()
	t.Logf("All readers: %d read operations", reads)
}

// TestConcurrency_AllWriters tests all-writer workload
func TestConcurrency_AllWriters(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	var wg sync.WaitGroup
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	writes := int64(0)

	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				default:
					manager.SetInstance(fmt.Sprintf("ws%d", idx%100), &Instance{
						ID:     fmt.Sprintf("inst_%d", idx),
						Status: StatusRunning,
					})
					atomic.AddInt64(&writes, 1)
				}
			}
		}(i)
	}

	wg.Wait()
	t.Logf("All writers: %d write operations", writes)
}

// TestConcurrency_Deleters tests concurrent deletion
func TestConcurrency_Deleters(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	var wg sync.WaitGroup
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	creates := int64(0)
	deletes := int64(0)

	// Half creators, half deleters
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				default:
					wsID := fmt.Sprintf("ws%d", idx%50)
					if idx < 50 {
						manager.SetInstance(wsID, &Instance{
							ID:     fmt.Sprintf("inst_%d", idx),
							Status: StatusRunning,
						})
						atomic.AddInt64(&creates, 1)
					} else {
						manager.RemoveInstance(wsID)
						atomic.AddInt64(&deletes, 1)
					}
				}
			}
		}(i)
	}

	wg.Wait()
	t.Logf("Creates: %d, Deletes: %d", creates, deletes)
}

// TestConcurrency_BurstTraffic tests burst traffic patterns
func TestConcurrency_BurstTraffic(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Pre-populate
	for i := 0; i < 10; i++ {
		manager.SetInstance(fmt.Sprintf("ws%d", i), &Instance{
			ID:     fmt.Sprintf("inst_%d", i),
			Status: StatusRunning,
		})
	}

	// Simulate burst traffic
	for burst := 0; burst < 10; burst++ {
		var wg sync.WaitGroup

		// Burst of 100 goroutines
		for i := 0; i < 100; i++ {
			wg.Add(1)
			go func(idx int) {
				defer wg.Done()
				for j := 0; j < 100; j++ {
					_ = manager.IsRunning(fmt.Sprintf("ws%d", idx%10))
				}
			}(i)
		}

		wg.Wait()

		// Brief pause between bursts
		time.Sleep(10 * time.Millisecond)
	}
}

// TestConcurrency_Starvation tests for reader/writer starvation
func TestConcurrency_Starvation(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	manager.SetInstance("ws1", &Instance{ID: "inst_1", Status: StatusRunning})

	var wg sync.WaitGroup
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	readerCounts := make([]int64, 10)
	writerCounts := make([]int64, 10)

	// Readers
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				default:
					_ = manager.IsRunning("ws1")
					atomic.AddInt64(&readerCounts[idx], 1)
				}
			}
		}(i)
	}

	// Writers
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				default:
					manager.SetInstance("ws1", &Instance{
						ID:     "inst_1",
						Status: StatusRunning,
					})
					atomic.AddInt64(&writerCounts[idx], 1)
				}
			}
		}(i)
	}

	wg.Wait()

	// Check for starvation (each goroutine should have done some work)
	for i, count := range readerCounts {
		if count == 0 {
			t.Errorf("reader %d was starved", i)
		}
		t.Logf("reader %d: %d ops", i, count)
	}

	for i, count := range writerCounts {
		if count == 0 {
			t.Errorf("writer %d was starved", i)
		}
		t.Logf("writer %d: %d ops", i, count)
	}
}

// TestConcurrency_GoroutineCount tests that we don't leak goroutines
func TestConcurrency_GoroutineCount(t *testing.T) {
	initialCount := runtime.NumGoroutine()

	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				manager.SetInstance(fmt.Sprintf("ws%d", idx), &Instance{
					ID:     fmt.Sprintf("inst_%d", idx),
					Status: StatusRunning,
				})
				_ = manager.IsRunning(fmt.Sprintf("ws%d", idx))
			}
		}(i)
	}

	wg.Wait()

	// Give goroutines time to clean up
	time.Sleep(100 * time.Millisecond)

	finalCount := runtime.NumGoroutine()

	// Allow some slack for test framework goroutines
	if finalCount > initialCount+10 {
		t.Errorf("possible goroutine leak: initial=%d, final=%d", initialCount, finalCount)
	}
}

// TestConcurrency_ContextCancellation tests context cancellation under load
func TestConcurrency_ContextCancellation(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	manager.SetInstance("ws1", &Instance{ID: "inst_1", Status: StatusRunning})

	for i := 0; i < 10; i++ {
		ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)

		var wg sync.WaitGroup
		for j := 0; j < 100; j++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				for {
					select {
					case <-ctx.Done():
						return
					default:
						_, _ = manager.GetInstance(ctx, "ws1")
					}
				}
			}()
		}

		// Cancel mid-operation
		time.Sleep(25 * time.Millisecond)
		cancel()

		wg.Wait()
	}
}

// TestConcurrency_SameWorkspace tests concurrent access to same workspace
func TestConcurrency_SameWorkspace(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	var wg sync.WaitGroup
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	operations := int64(0)

	// All goroutines operate on same workspace
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				default:
					switch idx % 5 {
					case 0:
						manager.SetInstance("shared_ws", &Instance{
							ID:     "shared_inst",
							Status: StatusRunning,
						})
					case 1:
						_ = manager.IsRunning("shared_ws")
					case 2:
						_ = manager.GetInstanceByID("shared_inst")
					case 3:
						_ = manager.ListInstances()
					case 4:
						// Occasional remove/re-add
						manager.RemoveInstance("shared_ws")
						manager.SetInstance("shared_ws", &Instance{
							ID:     "shared_inst",
							Status: StatusRunning,
						})
					}
					atomic.AddInt64(&operations, 1)
				}
			}
		}(i)
	}

	wg.Wait()
	t.Logf("Same workspace operations: %d", operations)
}

// TestConcurrency_MapGrowth tests concurrent map growth
func TestConcurrency_MapGrowth(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	var wg sync.WaitGroup
	numGoroutines := 100
	instancesPerGoroutine := 100

	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			for j := 0; j < instancesPerGoroutine; j++ {
				wsID := fmt.Sprintf("ws_%d_%d", idx, j)
				manager.SetInstance(wsID, &Instance{
					ID:     fmt.Sprintf("inst_%d_%d", idx, j),
					Status: StatusRunning,
				})
			}
		}(i)
	}

	wg.Wait()

	// All instances should be present
	instances := manager.ListInstances()
	expected := numGoroutines * instancesPerGoroutine
	if len(instances) != expected {
		t.Errorf("expected %d instances, got %d", expected, len(instances))
	}
}

// TestConcurrency_LockFairness tests lock fairness
func TestConcurrency_LockFairness(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	manager.SetInstance("ws1", &Instance{ID: "inst_1", Status: StatusRunning})

	var wg sync.WaitGroup
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	counts := make([]int64, 20)

	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				default:
					manager.SetInstance("ws1", &Instance{
						ID:     "inst_1",
						Status: StatusRunning,
					})
					atomic.AddInt64(&counts[idx], 1)
				}
			}
		}(i)
	}

	wg.Wait()

	// Calculate variance to check fairness
	total := int64(0)
	for _, c := range counts {
		total += c
	}
	avg := total / 20

	// Check that no goroutine got less than 10% of average
	for i, c := range counts {
		if c < avg/10 {
			t.Errorf("goroutine %d got unfairly low share: %d (avg: %d)", i, c, avg)
		}
	}
}

// TestConcurrency_Throughput tests overall throughput
func TestConcurrency_Throughput(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Pre-populate
	for i := 0; i < 10; i++ {
		manager.SetInstance(fmt.Sprintf("ws%d", i), &Instance{
			ID:     fmt.Sprintf("inst_%d", i),
			Status: StatusRunning,
		})
	}

	duration := time.Second
	start := time.Now()
	operations := int64(0)

	var wg sync.WaitGroup
	for i := 0; i < runtime.NumCPU(); i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for time.Since(start) < duration {
				_ = manager.IsRunning("ws0")
				atomic.AddInt64(&operations, 1)
			}
		}()
	}

	wg.Wait()
	elapsed := time.Since(start)
	opsPerSecond := float64(operations) / elapsed.Seconds()

	t.Logf("Throughput: %.0f ops/sec (%d total in %v)", opsPerSecond, operations, elapsed)

	// Should achieve reasonable throughput
	if opsPerSecond < 100000 {
		t.Logf("Warning: throughput seems low (%.0f ops/sec)", opsPerSecond)
	}
}
