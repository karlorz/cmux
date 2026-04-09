package cli

import (
	"context"
	"fmt"
	"time"

	"github.com/karlorz/devsh/internal/auth"
	"github.com/karlorz/devsh/internal/provider"
	"github.com/karlorz/devsh/internal/pvelxc"
	"github.com/karlorz/devsh/internal/vm"
)

func newTeamVMClient() (*vm.Client, error) {
	teamSlug, err := auth.GetTeamSlug()
	if err != nil {
		return nil, fmt.Errorf("failed to get team: %w", err)
	}

	client, err := vm.NewClient()
	if err != nil {
		return nil, fmt.Errorf("failed to create client: %w", err)
	}
	client.SetTeamSlug(teamSlug)

	return client, nil
}

func vmInstanceFromPveInstance(instance *pvelxc.Instance) *vm.Instance {
	return &vm.Instance{
		ID:        instance.ID,
		Status:    instance.Status,
		VSCodeURL: instance.VSCodeURL,
		VNCURL:    instance.VNCURL,
		XTermURL:  instance.XTermURL,
		WorkerURL: instance.WorkerURL,
	}
}

func getPveLxcInstance(ctx context.Context, instanceID string) (*vm.Instance, error) {
	if provider.HasPveEnv() {
		client, err := pvelxc.NewClientFromEnv()
		if err != nil {
			return nil, fmt.Errorf("failed to create PVE LXC client: %w\nSet PVE_API_URL and PVE_API_TOKEN", err)
		}

		instance, err := client.GetInstance(ctx, instanceID)
		if err != nil {
			return nil, fmt.Errorf("failed to get instance: %w", err)
		}
		return vmInstanceFromPveInstance(instance), nil
	}

	client, err := newTeamVMClient()
	if err != nil {
		return nil, err
	}

	instance, err := client.GetPveLxcInstance(ctx, instanceID)
	if err != nil {
		return nil, fmt.Errorf("failed to get instance: %w", err)
	}

	return instance, nil
}

func execPveLxcInstance(
	ctx context.Context,
	instanceID string,
	command string,
	timeoutSeconds int,
) (string, string, int, error) {
	if provider.HasPveEnv() {
		client, err := pvelxc.NewClientFromEnv()
		if err != nil {
			return "", "", -1, fmt.Errorf("failed to create PVE LXC client: %w\nSet PVE_API_URL and PVE_API_TOKEN", err)
		}

		stdout, stderr, exitCode, err := client.ExecCommand(ctx, instanceID, command)
		if err != nil {
			return "", "", -1, fmt.Errorf("failed to execute command: %w", err)
		}

		return stdout, stderr, exitCode, nil
	}

	client, err := newTeamVMClient()
	if err != nil {
		return "", "", -1, err
	}

	stdout, stderr, exitCode, err := client.ExecPveLxcInstance(ctx, instanceID, command, timeoutSeconds)
	if err != nil {
		return "", "", -1, fmt.Errorf("failed to execute command: %w", err)
	}

	return stdout, stderr, exitCode, nil
}

func pausePveLxcInstance(ctx context.Context, instanceID string) error {
	if provider.HasPveEnv() {
		client, err := pvelxc.NewClientFromEnv()
		if err != nil {
			return fmt.Errorf("failed to create PVE LXC client: %w\nSet PVE_API_URL and PVE_API_TOKEN", err)
		}

		if err := client.PauseInstance(ctx, instanceID); err != nil {
			return fmt.Errorf("failed to pause VM: %w", err)
		}
		return nil
	}

	client, err := newTeamVMClient()
	if err != nil {
		return err
	}

	if err := client.PausePveLxcInstance(ctx, instanceID); err != nil {
		return fmt.Errorf("failed to pause VM: %w", err)
	}

	return nil
}

func resumePveLxcInstance(ctx context.Context, instanceID string) (*vm.Instance, error) {
	if provider.HasPveEnv() {
		client, err := pvelxc.NewClientFromEnv()
		if err != nil {
			return nil, fmt.Errorf("failed to create PVE LXC client: %w\nSet PVE_API_URL and PVE_API_TOKEN", err)
		}

		if err := client.ResumeInstance(ctx, instanceID); err != nil {
			return nil, fmt.Errorf("failed to resume VM: %w", err)
		}

		if err := client.WaitForExecReady(ctx, instanceID, 2*time.Minute); err != nil {
			return nil, fmt.Errorf("VM failed to resume: %w", err)
		}

		instance, err := client.GetInstance(ctx, instanceID)
		if err != nil {
			return nil, fmt.Errorf("VM failed to resume: %w", err)
		}

		return vmInstanceFromPveInstance(instance), nil
	}

	client, err := newTeamVMClient()
	if err != nil {
		return nil, err
	}

	instance, err := client.ResumePveLxcInstance(ctx, instanceID)
	if err != nil {
		return nil, fmt.Errorf("failed to resume VM: %w", err)
	}

	return instance, nil
}

func stopPveLxcInstance(ctx context.Context, instanceID string) error {
	if provider.HasPveEnv() {
		client, err := pvelxc.NewClientFromEnv()
		if err != nil {
			return fmt.Errorf("failed to create PVE LXC client: %w\nSet PVE_API_URL and PVE_API_TOKEN", err)
		}

		if err := client.StopInstance(ctx, instanceID); err != nil {
			return fmt.Errorf("failed to delete VM: %w", err)
		}
		return nil
	}

	client, err := newTeamVMClient()
	if err != nil {
		return err
	}

	if err := client.StopPveLxcInstance(ctx, instanceID); err != nil {
		return fmt.Errorf("failed to delete VM: %w", err)
	}

	return nil
}
