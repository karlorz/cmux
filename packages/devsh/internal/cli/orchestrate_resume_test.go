package cli

import (
	"testing"

	"github.com/karlorz/devsh/internal/vm"
)

func TestLatestTaskRunSelectsNewestRun(t *testing.T) {
	task := &vm.TaskDetail{
		ID: "task_123",
		TaskRuns: []vm.TaskRun{
			{ID: "run_old", CreatedAt: 100},
			{ID: "run_new", CreatedAt: 300},
			{ID: "run_mid", CreatedAt: 200},
		},
	}

	selected, err := latestTaskRun(task)
	if err != nil {
		t.Fatalf("latestTaskRun failed: %v", err)
	}

	if selected.ID != "run_new" {
		t.Fatalf("expected newest run, got %s", selected.ID)
	}
}

func TestLatestTaskRunErrorsWhenTaskHasNoRuns(t *testing.T) {
	_, err := latestTaskRun(&vm.TaskDetail{ID: "task_empty"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if err.Error() != "task task_empty has no runs yet" {
		t.Fatalf("unexpected error: %v", err)
	}
}
