import { Doc } from "@cmux/convex/dataModel";
import { TaskCard } from "./task-card";

interface TaskSectionProps {
  title: string;
  description: string;
  tasks: Doc<"tasks">[];
  emptyMessage: string;
  teamSlugOrId: string;
}

export function TaskSection({
  title,
  description,
  tasks,
  emptyMessage,
  teamSlugOrId,
}: TaskSectionProps) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        <p className="text-sm text-neutral-400">{description}</p>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-8 text-center">
          <p className="text-sm text-neutral-500">{emptyMessage}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tasks.map((task) => (
            <TaskCard key={task._id} task={task} teamSlugOrId={teamSlugOrId} />
          ))}
        </div>
      )}
    </section>
  );
}
