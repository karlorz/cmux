import { useMemo, useState, useEffect } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  MarkerType,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Users, Clock, CheckCircle2, XCircle, Loader2, Pause, Play } from "lucide-react";
import { STATUS_CONFIG, STATUS_GRAPH_COLORS, type TaskStatus } from "./status-config";
import type { OrchestrationTaskWithDeps } from "./OrchestrationDashboard";

interface OrchestrationDependencyGraphProps {
  tasks?: OrchestrationTaskWithDeps[];
  loading: boolean;
  onTaskClick?: (taskId: string) => void;
}

interface TaskNodeData extends Record<string, unknown> {
  task: OrchestrationTaskWithDeps;
  label: string;
  status: TaskStatus;
  agent?: string;
  onTaskClick?: (taskId: string) => void;
}

type TaskNode = Node<TaskNodeData, "taskNode">;

function truncatePrompt(prompt: string | null | undefined, maxLen = 60): string {
  if (!prompt) {
    return "Untitled task";
  }
  const firstLine = prompt.split("\n")[0] ?? prompt;
  const clean = firstLine.trim();
  if (clean.length <= maxLen) {
    return clean;
  }
  return `${clean.slice(0, maxLen)}...`;
}

function isDependencyTaskId(depId: unknown): depId is string {
  return typeof depId === "string" && depId.length > 0;
}

// Status icons mapping
const STATUS_ICONS: Record<TaskStatus, React.ElementType> = {
  pending: Clock,
  assigned: Play,
  running: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
  cancelled: Pause,
};

// Custom node component for tasks
function TaskNode({ data, selected }: NodeProps<TaskNode>) {
  const [showPopover, setShowPopover] = useState(false);
  const nodeData = data as TaskNodeData;
  const colors = STATUS_GRAPH_COLORS[nodeData.status] ?? STATUS_GRAPH_COLORS.pending;
  const statusConf = STATUS_CONFIG[nodeData.status];
  const StatusIcon = STATUS_ICONS[nodeData.status];
  const isRunning = nodeData.status === "running";

  return (
    <>
      {/* Input handle for dependencies */}
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-neutral-400 !border-neutral-300 dark:!bg-neutral-500 dark:!border-neutral-600 !w-2 !h-2"
      />

      <div
        className={`
          relative rounded-lg border-2 p-3 shadow-sm transition-all duration-200 cursor-pointer
          ${colors.border} ${colors.bg}
          ${selected ? "ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-neutral-900" : ""}
          hover:shadow-md hover:scale-[1.02]
        `}
        style={{ width: 240, minHeight: 72 }}
        onMouseEnter={() => setShowPopover(true)}
        onMouseLeave={() => setShowPopover(false)}
        onClick={() => nodeData.onTaskClick?.(nodeData.task._id)}
      >
        {/* Status indicator with animation */}
        <div className="flex items-start gap-2">
          <div className={`mt-0.5 ${isRunning ? "animate-spin" : ""}`}>
            <StatusIcon className={`size-4 ${statusConf?.color ?? "text-neutral-500"}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-tight text-neutral-900 dark:text-neutral-100 line-clamp-2">
              {nodeData.label}
            </p>
            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
              <span className={`font-medium ${statusConf?.color ?? ""}`}>
                {statusConf?.label ?? nodeData.status}
              </span>
              {nodeData.agent && (
                <>
                  <span className="text-neutral-300 dark:text-neutral-600">|</span>
                  <span className="truncate max-w-[120px]">{nodeData.agent}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Running indicator pulse */}
        {isRunning && (
          <div className="absolute -top-1 -right-1">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
            </span>
          </div>
        )}

        {/* Hover popover */}
        {showPopover && (
          <TaskPopover task={nodeData.task} />
        )}
      </div>

      {/* Output handle for dependents */}
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-neutral-400 !border-neutral-300 dark:!bg-neutral-500 dark:!border-neutral-600 !w-2 !h-2"
      />
    </>
  );
}

// Task popover component
function TaskPopover({ task }: { task: OrchestrationTaskWithDeps }) {
  const depInfo = task.dependencyInfo;

  return (
    <div
      className="absolute left-full top-0 ml-2 z-50 w-72 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="space-y-2">
        {/* Full prompt */}
        <div>
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">Prompt</p>
          <p className="text-sm text-neutral-900 dark:text-neutral-100 line-clamp-4">
            {task.prompt || "No prompt"}
          </p>
        </div>

        {/* Agent */}
        {task.assignedAgentName && (
          <div>
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">Agent</p>
            <p className="text-sm text-neutral-900 dark:text-neutral-100">
              {task.assignedAgentName}
            </p>
          </div>
        )}

        {/* Dependencies */}
        {depInfo && depInfo.totalDeps > 0 && (
          <div>
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
              Dependencies ({depInfo.completedDeps}/{depInfo.totalDeps})
            </p>
            <div className="flex gap-1">
              {Array.from({ length: depInfo.totalDeps }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full ${
                    i < depInfo.completedDeps
                      ? "bg-green-500"
                      : "bg-neutral-200 dark:bg-neutral-600"
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Error message */}
        {task.errorMessage && (
          <div>
            <p className="text-xs font-medium text-red-500 mb-1">Error</p>
            <p className="text-xs text-red-600 dark:text-red-400 line-clamp-2">
              {task.errorMessage}
            </p>
          </div>
        )}

        {/* Result */}
        {task.result && (
          <div>
            <p className="text-xs font-medium text-green-500 mb-1">Result</p>
            <p className="text-xs text-green-600 dark:text-green-400 line-clamp-2">
              {task.result}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Node types registry
const nodeTypes = {
  taskNode: TaskNode,
};

/**
 * Compute graph layout using topological sort.
 * Tasks with no dependencies go to level 0, tasks depending only
 * on level-0 tasks go to level 1, etc.
 */
function computeGraphLayout(
  tasks: OrchestrationTaskWithDeps[],
  onTaskClick?: (taskId: string) => void
): { nodes: TaskNode[]; edges: Edge[] } {
  const taskMap = new Map<string, OrchestrationTaskWithDeps>();
  for (const t of tasks) {
    taskMap.set(t._id, t);
  }

  // Compute levels via topological sort
  const levels = new Map<string, number>();
  const visiting = new Set<string>();

  function getLevel(id: string): number {
    if (levels.has(id)) {
      return levels.get(id)!;
    }
    if (visiting.has(id)) {
      // Cycle detected, break it
      return 0;
    }
    visiting.add(id);
    const task = taskMap.get(id);
    if (!task?.dependencies?.length) {
      levels.set(id, 0);
      visiting.delete(id);
      return 0;
    }
    let maxDepLevel = 0;
    for (const depId of task.dependencies) {
      if (!isDependencyTaskId(depId)) continue;
      if (taskMap.has(depId)) {
        maxDepLevel = Math.max(maxDepLevel, getLevel(depId) + 1);
      }
    }
    levels.set(id, maxDepLevel);
    visiting.delete(id);
    return maxDepLevel;
  }

  for (const t of tasks) {
    getLevel(t._id);
  }

  // Group by level
  const levelGroups = new Map<number, OrchestrationTaskWithDeps[]>();
  for (const t of tasks) {
    const level = levels.get(t._id) ?? 0;
    const group = levelGroups.get(level) ?? [];
    group.push(t);
    levelGroups.set(level, group);
  }

  // Layout constants
  const NODE_WIDTH = 240;
  const NODE_HEIGHT = 72;
  const LEVEL_GAP = 120;
  const NODE_GAP = 24;
  const PADDING = 50;

  // Create nodes with positions
  const nodes: TaskNode[] = [];
  for (const [level, group] of levelGroups) {
    const startY = PADDING;

    group.forEach((task, idx) => {
      const x = PADDING + level * (NODE_WIDTH + LEVEL_GAP);
      const y = startY + idx * (NODE_HEIGHT + NODE_GAP);

      nodes.push({
        id: task._id,
        type: "taskNode",
        position: { x, y },
        data: {
          task,
          label: truncatePrompt(task.prompt),
          status: task.status as TaskStatus,
          agent: task.assignedAgentName ?? undefined,
          onTaskClick,
        },
      });
    });
  }

  // Create edges
  const edges: Edge[] = [];
  for (const task of tasks) {
    if (!task.dependencies?.length) continue;

    for (const depId of task.dependencies) {
      if (!isDependencyTaskId(depId)) continue;
      if (!taskMap.has(depId)) continue;

      const depTask = taskMap.get(depId)!;
      const depStatus = depTask.status as TaskStatus;

      // Color edge based on dependency status
      let edgeColor = "#9ca3af"; // neutral
      if (depStatus === "completed") {
        edgeColor = "#22c55e"; // green
      } else if (depStatus === "failed") {
        edgeColor = "#ef4444"; // red
      } else if (depStatus === "running") {
        edgeColor = "#3b82f6"; // blue
      }

      edges.push({
        id: `${depId}->${task._id}`,
        source: depId,
        target: task._id,
        type: "smoothstep",
        animated: depStatus === "running",
        style: { stroke: edgeColor, strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edgeColor,
          width: 16,
          height: 16,
        },
      });
    }
  }

  return { nodes, edges };
}

// Minimap node color function
function getMinimapNodeColor(node: Node): string {
  const data = node.data as TaskNodeData | undefined;
  if (!data) return "#9ca3af";

  const statusColors: Record<TaskStatus, string> = {
    pending: "#9ca3af",
    assigned: "#3b82f6",
    running: "#3b82f6",
    completed: "#22c55e",
    failed: "#ef4444",
    cancelled: "#9ca3af",
  };

  return statusColors[data.status] ?? "#9ca3af";
}

export function OrchestrationDependencyGraph({
  tasks,
  loading,
  onTaskClick,
}: OrchestrationDependencyGraphProps) {
  const { initialNodes, initialEdges, hasDeps } = useMemo(() => {
    if (!tasks || tasks.length === 0) {
      return { initialNodes: [] as TaskNode[], initialEdges: [] as Edge[], hasDeps: false };
    }

    const { nodes, edges } = computeGraphLayout(tasks, onTaskClick);
    const hasDependencies = tasks.some((t) => t.dependencies && t.dependencies.length > 0);

    return { initialNodes: nodes, initialEdges: edges, hasDeps: hasDependencies };
  }, [tasks, onTaskClick]);

  const [nodes, setNodes, onNodesChange] = useNodesState<TaskNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes/edges when tasks change
  useEffect(() => {
    if (initialNodes.length > 0) {
      setNodes(initialNodes);
      setEdges(initialEdges);
    }
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600 dark:border-neutral-600 dark:border-t-neutral-300" />
      </div>
    );
  }

  if (!tasks || tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-neutral-500 dark:text-neutral-400">
        <Users className="size-8 text-neutral-400 dark:text-neutral-500" />
        <div className="text-sm font-medium text-neutral-600 dark:text-neutral-200">
          No tasks to visualize
        </div>
        <p className="text-xs">
          Spawn agents to see the dependency graph.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-neutral-100 px-4 py-2 text-[11px] text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        {(Object.entries(STATUS_GRAPH_COLORS) as Array<[TaskStatus, { dot: string }]>).map(([status, { dot }]) => {
          const conf = STATUS_CONFIG[status];
          if (!conf) return null;
          return (
            <span key={status} className="flex items-center gap-1.5">
              <span className={`inline-block size-2 rounded-full ${dot.replace(" animate-pulse", "")}`} />
              {conf.label}
            </span>
          );
        })}
        {!hasDeps && (
          <span className="ml-auto text-neutral-400 dark:text-neutral-500 italic">
            No dependency edges
          </span>
        )}
        <span className="ml-auto text-neutral-400 dark:text-neutral-500">
          Scroll to zoom | Drag to pan
        </span>
      </div>

      {/* React Flow canvas */}
      <div className="h-[500px] w-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1.5 }}
          minZoom={0.1}
          maxZoom={2}
          defaultEdgeOptions={{
            type: "smoothstep",
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Controls
            className="!bg-white dark:!bg-neutral-800 !border-neutral-200 dark:!border-neutral-700 !shadow-md"
            showInteractive={false}
          />
          <MiniMap
            nodeColor={getMinimapNodeColor}
            maskColor="rgba(0, 0, 0, 0.1)"
            className="!bg-neutral-50 dark:!bg-neutral-900 !border-neutral-200 dark:!border-neutral-700"
            pannable
            zoomable
          />
          <Background
            variant={BackgroundVariant.Dots}
            gap={16}
            size={1}
            className="!bg-neutral-50 dark:!bg-neutral-900"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
