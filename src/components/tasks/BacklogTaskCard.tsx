import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Megaphone, Users } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { TaskAssigneeAvatar } from "./TaskAssigneeAvatar";
import { BacklogInlinePicker } from "./BacklogInlinePicker";
import { TaskCardMeta } from "./TaskCardMeta";
import { BacklogDates } from "./BacklogDates";
import type { Task } from "./taskTypes";

interface BacklogTaskCardProps {
  task: Task;
  onToggleComplete: (taskId: string, completed: boolean) => void;
  onClick: () => void;
  isOverdue: boolean;
  clientsList?: Array<{ id: string; name: string }>;
  campaignersList?: Array<{ id: string; full_name: string }>;
  onUpdateClient?: (taskId: string, clientId: string | null) => void;
  onUpdateCampaigner?: (taskId: string, campaignerId: string | null) => void;
}

/**
 * A draggable card in the task backlog: drag it onto a day or a time slot.
 * Overdue cards carry a red edge instead of tinting the whole panel.
 */
export function BacklogTaskCard({
  task,
  onToggleComplete,
  onClick,
  isOverdue,
  clientsList,
  campaignersList,
  onUpdateClient,
  onUpdateCampaigner,
}: BacklogTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: task.id, data: { task } });
  const isCompleted = task.status === "done";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        "group rounded-xl border border-s-4 border-s-transparent bg-card p-3 transition-shadow hover:shadow-elevation-1",
        isDragging && "opacity-50 shadow-elevation-2",
        isCompleted && "opacity-60",
        isOverdue && "border-s-destructive",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          {...listeners}
          {...attributes}
          className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground/60 hover:text-muted-foreground active:cursor-grabbing"
          aria-label="גרור לתזמון"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div onClick={(e) => e.stopPropagation()} className="pt-0.5">
          <Checkbox
            checked={isCompleted}
            onCheckedChange={(checked) =>
              onToggleComplete(task.id, checked as boolean)
            }
          />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start gap-2">
            <p
              onClick={onClick}
              className={cn(
                "min-w-0 flex-1 cursor-pointer whitespace-normal break-words text-sm font-semibold leading-snug",
                isCompleted && "text-muted-foreground line-through",
              )}
            >
              {task.title}
            </p>
            {/* The campaigner picker already names the assignee. */}
            {!onUpdateCampaigner && task.campaigners?.full_name && (
              <TaskAssigneeAvatar name={task.campaigners.full_name} />
            )}
          </div>
          {(onUpdateClient || onUpdateCampaigner) && (
            <div
              className="flex flex-wrap items-center gap-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              {onUpdateClient && clientsList && (
                <BacklogInlinePicker
                  icon={<Users className="h-3 w-3 shrink-0" />}
                  selectedId={task.client_id}
                  options={clientsList.map((c) => ({
                    id: c.id,
                    label: c.name,
                  }))}
                  fallbackLabel="לקוח"
                  noneLabel="ללא לקוח"
                  searchPlaceholder="חיפוש לקוח..."
                  onSelect={(id) => onUpdateClient(task.id, id)}
                />
              )}
              {onUpdateCampaigner && campaignersList && (
                <BacklogInlinePicker
                  icon={<Megaphone className="h-3 w-3 shrink-0" />}
                  selectedId={task.campaigner_id}
                  options={campaignersList.map((c) => ({
                    id: c.id,
                    label: c.full_name,
                  }))}
                  fallbackLabel="קמפיינר"
                  noneLabel="ללא קמפיינר"
                  searchPlaceholder="חיפוש קמפיינר..."
                  onSelect={(id) => onUpdateCampaigner(task.id, id)}
                />
              )}
            </div>
          )}
          <div onClick={onClick} className="cursor-pointer">
            <TaskCardMeta
              task={task}
              showClient={!onUpdateClient}
              when={<BacklogDates task={task} isOverdue={isOverdue} />}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
