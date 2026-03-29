type TaskRunCreateArgsInput<
  TTaskId extends string = string,
  TEnvironmentId extends string | undefined = string | undefined,
> = {
  teamSlugOrId: string;
  taskId: TTaskId;
  prompt: string;
  agentName?: string;
  selectedVariant?: string;
  newBranch?: string;
  environmentId?: TEnvironmentId;
  isOrchestrationHead?: boolean;
  orchestrationId?: string;
};

export function buildTaskRunCreateArgs<
  TTaskId extends string,
  TEnvironmentId extends string | undefined = string | undefined,
>(
  args: TaskRunCreateArgsInput<TTaskId, TEnvironmentId>,
): TaskRunCreateArgsInput<TTaskId, TEnvironmentId>;
export function buildTaskRunCreateArgs<
  TTaskId extends string,
  TEnvironmentId extends string | undefined = string | undefined,
>(
  args: TaskRunCreateArgsInput<TTaskId, TEnvironmentId>,
): TaskRunCreateArgsInput<TTaskId, TEnvironmentId> {
  return {
    teamSlugOrId: args.teamSlugOrId,
    taskId: args.taskId,
    prompt: args.prompt,
    ...(args.agentName !== undefined ? { agentName: args.agentName } : {}),
    ...(args.selectedVariant !== undefined
      ? { selectedVariant: args.selectedVariant }
      : {}),
    ...(args.newBranch !== undefined ? { newBranch: args.newBranch } : {}),
    ...(args.environmentId !== undefined
      ? { environmentId: args.environmentId }
      : {}),
    ...(args.isOrchestrationHead !== undefined
      ? { isOrchestrationHead: args.isOrchestrationHead }
      : {}),
    ...(args.orchestrationId !== undefined
      ? { orchestrationId: args.orchestrationId }
      : {}),
  };
}
