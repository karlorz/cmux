/**
 * MilestoneEditor Component
 *
 * UI for creating and managing project milestones with due dates and progress tracking.
 */

import { useState, useCallback } from "react";
import {
  Plus,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  Trash2,
  Edit2,
  X,
  Check,
} from "lucide-react";
import clsx from "clsx";
import { format, isPast, isToday, differenceInDays } from "date-fns";

import { Button } from "@/components/ui/button";

export interface Milestone {
  id: string;
  title: string;
  description?: string;
  dueDate?: number; // epoch ms
  status: "not_started" | "in_progress" | "completed" | "overdue";
  totalTasks?: number;
  completedTasks?: number;
  completedAt?: number;
}

interface MilestoneEditorProps {
  milestones: Milestone[];
  onAdd?: (milestone: Omit<Milestone, "id">) => Promise<void>;
  onUpdate?: (id: string, updates: Partial<Milestone>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  readOnly?: boolean;
}

const STATUS_CONFIG = {
  not_started: {
    icon: Clock,
    color: "text-neutral-500",
    bgColor: "bg-neutral-100 dark:bg-neutral-800",
    label: "Not Started",
  },
  in_progress: {
    icon: ChevronRight,
    color: "text-blue-500",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    label: "In Progress",
  },
  completed: {
    icon: CheckCircle2,
    color: "text-green-500",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    label: "Completed",
  },
  overdue: {
    icon: AlertCircle,
    color: "text-red-500",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    label: "Overdue",
  },
};

function DueDateBadge({ dueDate }: { dueDate?: number }) {
  if (!dueDate) return null;

  const date = new Date(dueDate);
  const isOverdue = isPast(date) && !isToday(date);
  const daysUntil = differenceInDays(date, new Date());

  let color = "text-neutral-500";
  let bg = "bg-neutral-100 dark:bg-neutral-800";

  if (isOverdue) {
    color = "text-red-600 dark:text-red-400";
    bg = "bg-red-50 dark:bg-red-900/20";
  } else if (isToday(date)) {
    color = "text-amber-600 dark:text-amber-400";
    bg = "bg-amber-50 dark:bg-amber-900/20";
  } else if (daysUntil <= 7) {
    color = "text-blue-600 dark:text-blue-400";
    bg = "bg-blue-50 dark:bg-blue-900/20";
  }

  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", color, bg)}>
      <Calendar className="size-3" />
      {format(date, "MMM d")}
      {isOverdue && " (overdue)"}
      {isToday(date) && " (today)"}
    </span>
  );
}

function ProgressBar({ completed, total }: { completed: number; total: number }) {
  if (total === 0) return null;

  const percent = Math.round((completed / total) * 100);

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
        <div
          className="h-full rounded-full bg-green-500 transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-xs text-neutral-500 dark:text-neutral-400 min-w-[40px] text-right">
        {completed}/{total}
      </span>
    </div>
  );
}

function MilestoneItem({
  milestone,
  onUpdate,
  onDelete,
  readOnly,
}: {
  milestone: Milestone;
  onUpdate?: (id: string, updates: Partial<Milestone>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  readOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(milestone.title);
  const [editDescription, setEditDescription] = useState(milestone.description ?? "");
  const [editDueDate, setEditDueDate] = useState(
    milestone.dueDate ? format(new Date(milestone.dueDate), "yyyy-MM-dd") : ""
  );
  const [saving, setSaving] = useState(false);

  const config = STATUS_CONFIG[milestone.status];
  const StatusIcon = config.icon;

  const handleSave = useCallback(async () => {
    if (!onUpdate) return;
    setSaving(true);
    try {
      await onUpdate(milestone.id, {
        title: editTitle,
        description: editDescription || undefined,
        dueDate: editDueDate ? new Date(editDueDate).getTime() : undefined,
      });
      setEditing(false);
    } catch (error) {
      console.error("Failed to save milestone:", error);
    } finally {
      setSaving(false);
    }
  }, [milestone.id, editTitle, editDescription, editDueDate, onUpdate]);

  const handleStatusChange = useCallback(async (newStatus: Milestone["status"]) => {
    if (!onUpdate) return;
    await onUpdate(milestone.id, {
      status: newStatus,
      completedAt: newStatus === "completed" ? Date.now() : undefined,
    });
  }, [milestone.id, onUpdate]);

  if (editing) {
    return (
      <div className="rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10 p-4 space-y-3">
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          placeholder="Milestone title"
          className="w-full rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <textarea
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="w-full rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-neutral-500" />
            <input
              type="date"
              value={editDueDate}
              onChange={(e) => setEditDueDate(e.target.value)}
              className="rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>
            <X className="size-4 mr-1" />
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !editTitle.trim()}>
            <Check className="size-4 mr-1" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "rounded-lg border p-4 transition-all",
        "border-neutral-200 dark:border-neutral-800",
        "hover:border-neutral-300 dark:hover:border-neutral-700"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Expand toggle */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-0.5 p-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          {expanded ? (
            <ChevronDown className="size-4 text-neutral-400" />
          ) : (
            <ChevronRight className="size-4 text-neutral-400" />
          )}
        </button>

        {/* Status icon */}
        <div className={clsx("mt-0.5 rounded-full p-1", config.bgColor)}>
          <StatusIcon className={clsx("size-4", config.color)} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="font-medium text-neutral-900 dark:text-neutral-100">
                {milestone.title}
              </h4>
              <div className="flex items-center gap-2 mt-1">
                <span className={clsx("text-xs font-medium", config.color)}>
                  {config.label}
                </span>
                <DueDateBadge dueDate={milestone.dueDate} />
              </div>
            </div>

            {!readOnly && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
                  title="Edit milestone"
                >
                  <Edit2 className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete?.(milestone.id)}
                  className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-neutral-500 hover:text-red-600"
                  title="Delete milestone"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            )}
          </div>

          {/* Progress bar */}
          {(milestone.totalTasks ?? 0) > 0 && (
            <div className="mt-3">
              <ProgressBar
                completed={milestone.completedTasks ?? 0}
                total={milestone.totalTasks ?? 0}
              />
            </div>
          )}

          {/* Expanded content */}
          {expanded && (
            <div className="mt-3 pt-3 border-t border-neutral-100 dark:border-neutral-800 space-y-3">
              {milestone.description && (
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  {milestone.description}
                </p>
              )}

              {!readOnly && onUpdate && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500">Status:</span>
                  <div className="flex gap-1">
                    {(Object.keys(STATUS_CONFIG) as Array<keyof typeof STATUS_CONFIG>).map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => handleStatusChange(status)}
                        className={clsx(
                          "px-2 py-1 rounded text-xs font-medium transition-colors",
                          milestone.status === status
                            ? STATUS_CONFIG[status].bgColor + " " + STATUS_CONFIG[status].color
                            : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                        )}
                      >
                        {STATUS_CONFIG[status].label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {milestone.completedAt && (
                <p className="text-xs text-neutral-500">
                  Completed on {format(new Date(milestone.completedAt), "MMM d, yyyy")}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AddMilestoneForm({
  onAdd,
  onCancel,
}: {
  onAdd: (milestone: Omit<Milestone, "id">) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onAdd({
        title: title.trim(),
        description: description.trim() || undefined,
        dueDate: dueDate ? new Date(dueDate).getTime() : undefined,
        status: "not_started",
      });
      onCancel();
    } catch (error) {
      console.error("Failed to add milestone:", error);
    } finally {
      setSaving(false);
    }
  }, [title, description, dueDate, onAdd, onCancel]);

  return (
    <div className="rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10 p-4 space-y-3">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Milestone title"
        autoFocus
        className="w-full rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        className="w-full rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-neutral-500" />
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={saving || !title.trim()}>
          <Plus className="size-4 mr-1" />
          {saving ? "Adding..." : "Add Milestone"}
        </Button>
      </div>
    </div>
  );
}

export function MilestoneEditor({
  milestones,
  onAdd,
  onUpdate,
  onDelete,
  readOnly,
}: MilestoneEditorProps) {
  const [showAddForm, setShowAddForm] = useState(false);

  // Sort milestones by due date, then by status
  const sortedMilestones = [...milestones].sort((a, b) => {
    // Completed items go to the bottom
    if (a.status === "completed" && b.status !== "completed") return 1;
    if (b.status === "completed" && a.status !== "completed") return -1;

    // Then sort by due date
    if (a.dueDate && b.dueDate) {
      return a.dueDate - b.dueDate;
    }
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;

    return 0;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
          Milestones ({milestones.length})
        </h3>
        {!readOnly && onAdd && !showAddForm && (
          <Button variant="outline" size="sm" onClick={() => setShowAddForm(true)}>
            <Plus className="size-4 mr-1" />
            Add Milestone
          </Button>
        )}
      </div>

      {/* Add form */}
      {showAddForm && onAdd && (
        <AddMilestoneForm onAdd={onAdd} onCancel={() => setShowAddForm(false)} />
      )}

      {/* Milestone list */}
      {sortedMilestones.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center">
          <Calendar className="size-8 mx-auto text-neutral-400 dark:text-neutral-500 mb-2" />
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No milestones yet
          </p>
          {!readOnly && onAdd && (
            <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
              Add milestones to track project progress
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {sortedMilestones.map((milestone) => (
            <MilestoneItem
              key={milestone.id}
              milestone={milestone}
              onUpdate={onUpdate}
              onDelete={onDelete}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
    </div>
  );
}
