import type { ReactNode } from "react";
import { Building2, MessageSquare, UserRound, Users } from "lucide-react";
import { StatusChip } from "@/components/report-ui/StatusChip";
import { embedCount } from "@/lib/embedCount";
import { cn } from "@/lib/utils";
import { taskPriorityChip } from "./taskPriorityChip";
import type { Task } from "./taskTypes";

type MetaTask = Pick<
  Task,
  | "priority"
  | "clients"
  | "leads"
  | "creator_name"
  | "task_updates"
  | "task_collaborators"
>;

/**
 * The line under a task card's title: priority chip, client or lead, an
 * optional when (`when`), update and collaborator counts and who gave it.
 * `showClient` is off where an inline client picker already shows it. The
 * assignee's avatar sits on the title row instead, so this line stays short.
 */
export function TaskCardMeta({
  task,
  when,
  showClient = true,
  className,
}: {
  task: MetaTask;
  when?: ReactNode;
  showClient?: boolean;
  className?: string;
}) {
  const priority = taskPriorityChip(task.priority);
  const entity = showClient
    ? task.clients?.name || task.leads?.company_name || task.leads?.contact_name
    : null;
  const updates = embedCount(task.task_updates);
  const collaborators = embedCount(task.task_collaborators);
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground",
        className,
      )}
    >
      {priority && (
        <StatusChip tone={priority.tone}>{priority.label}</StatusChip>
      )}
      {entity && (
        <MetaItem icon={<Building2 className="h-3.5 w-3.5" />}>
          <span className="max-w-[160px] truncate">{entity}</span>
        </MetaItem>
      )}
      {when}
      {updates > 0 && (
        <MetaItem icon={<MessageSquare className="h-3.5 w-3.5" />}>
          {updates}
        </MetaItem>
      )}
      {collaborators > 0 && (
        <MetaItem icon={<Users className="h-3.5 w-3.5" />}>
          {collaborators}
        </MetaItem>
      )}
      {task.creator_name && (
        <MetaItem icon={<UserRound className="h-3.5 w-3.5" />}>
          מאת {task.creator_name}
        </MetaItem>
      )}
    </div>
  );
}

/** One icon-and-text fact in the meta line. */
export function MetaItem({
  icon,
  className,
  children,
}: {
  icon: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {icon}
      {children}
    </span>
  );
}
