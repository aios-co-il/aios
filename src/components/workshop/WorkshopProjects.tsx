import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  statusLabel,
  type ClientGroup,
  type WorkshopListRow,
} from "./workshopProjectList";
import { NewProjectDialog } from "./NewProjectDialog";
import { ProjectRowMenu } from "./ProjectRowMenu";
import type { ProjectActions } from "./useWorkshopProjectActions";

const STATUS_TONE: Record<string, string> = {
  draft: "bg-white/10 text-slate-300",
  in_progress: "bg-sky-400/15 text-sky-200",
  waiting_approval: "bg-amber-400/15 text-amber-200",
  approved: "bg-emerald-400/15 text-emerald-200",
  published: "bg-emerald-400/25 text-emerald-100",
  failed: "bg-red-400/15 text-red-200",
};

/** A project in the list with its menu; its client is named by the group it sits in. */
function ProjectRow({
  item,
  selected,
  onSelect,
  actions,
}: {
  item: WorkshopListRow;
  selected: boolean;
  onSelect: (id: string) => void;
  actions: ProjectActions;
}) {
  const title = item.title?.trim() || "ללא שם";
  return (
    <div
      className={cn(
        "group mb-1 flex items-start gap-1 rounded-lg hover:bg-white/10",
        selected && "bg-white/15",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(item.id)}
        className={cn(
          "min-w-0 flex-1 px-3 py-2 text-right text-sm text-slate-200",
          selected && "font-medium text-white",
        )}
      >
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0 break-words">{title}</span>
          <span
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-normal",
              STATUS_TONE[item.status] ?? STATUS_TONE.draft,
            )}
          >
            {statusLabel(item.status)}
          </span>
        </span>
      </button>
      <div className="pt-1.5">
        <ProjectRowMenu itemId={item.id} title={title} actions={actions} />
      </div>
    </div>
  );
}

export function WorkshopProjects({
  groups,
  byClient,
  selectedId,
  loading,
  error,
  actions,
  onSelect,
}: {
  groups: Array<ClientGroup>;
  /** Every client is in view: the list is grouped by client first. */
  byClient: boolean;
  selectedId: string | null;
  loading: boolean;
  error: boolean;
  actions: ProjectActions;
  onSelect: (id: string) => void;
}) {
  return (
    <aside
      aria-label="פרויקטים"
      className="flex max-h-72 w-full shrink-0 flex-col border-b border-[rgb(136_193_255/26%)] bg-[#0a1526] text-slate-100 md:max-h-none md:min-h-0 md:w-72 md:overflow-hidden md:border-b-0 md:border-l"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[rgb(136_193_255/26%)] px-3 py-2">
        <span className="text-sm font-medium">פרויקטים</span>
        <NewProjectDialog actions={actions} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? (
          <Loader2 className="mx-auto mt-6 h-4 w-4 animate-spin" />
        ) : error ? (
          <p className="p-2 text-sm text-red-300">
            לא הצלחנו לטעון את הפרויקטים
          </p>
        ) : groups.length ? (
          groups.map((group) => (
            <section
              key={group.clientId ?? "none"}
              className={cn(byClient && "mb-3")}
            >
              {byClient ? (
                <h3 className="flex items-center justify-between px-2 pb-1 pt-2 text-xs font-semibold text-sky-100">
                  <span className="truncate">{group.name}</span>
                  <span className="text-slate-400">{group.count}</span>
                </h3>
              ) : null}
              {group.departments.map((dept) => (
                <div key={dept.department} className="mb-2">
                  <h4 className="flex items-center justify-between px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    <span>{dept.label}</span>
                    <span>{dept.items.length}</span>
                  </h4>
                  {dept.items.map((item) => (
                    <ProjectRow
                      key={item.id}
                      item={item}
                      selected={selectedId === item.id}
                      onSelect={onSelect}
                      actions={actions}
                    />
                  ))}
                </div>
              ))}
            </section>
          ))
        ) : (
          <p className="p-2 text-sm text-slate-400">אין פרויקטים עדיין</p>
        )}
      </div>
    </aside>
  );
}
