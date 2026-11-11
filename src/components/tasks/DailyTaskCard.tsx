import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { TaskAssigneeAvatar } from "./TaskAssigneeAvatar";
import { TaskCardMeta } from "./TaskCardMeta";
import type { Task } from "./taskTypes";

/** A day-view task card: drag it to another hour, tick it, or open it. */
export function DailyTaskCard({
  task,
  onToggleComplete,
  onClick,
}: {
  task: Task;
  onToggleComplete: (taskId: string, completed: boolean) => void;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: task.id,
      data: { task },
    });
  const isCompleted = task.status === "done";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
      className={cn(
        "cursor-grab rounded-xl border border-s-4 border-s-brand-accent bg-card p-3 transition-shadow hover:shadow-elevation-1 active:cursor-grabbing",
        isDragging && "opacity-50 shadow-elevation-2",
        isCompleted && "border-s-muted-foreground/40 opacity-60",
      )}
    >
      <div className="flex items-start gap-2">
        <div onClick={(e) => e.stopPropagation()} className="pt-0.5">
          <Checkbox
            checked={isCompleted}
            onCheckedChange={(checked) =>
              onToggleComplete(task.id, checked as boolean)
            }
          />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5" onClick={onClick}>
          <div className="flex items-start gap-2">
            <p
              className={cn(
                "min-w-0 flex-1 truncate text-sm font-semibold",
                isCompleted && "text-muted-foreground line-through",
              )}
            >
              {task.title}
            </p>
            {task.campaigners?.full_name && (
              <TaskAssigneeAvatar name={task.campaigners.full_name} />
            )}
          </div>
          <TaskCardMeta task={task} />
        </div>
      </div>
    </div>
  );
}
