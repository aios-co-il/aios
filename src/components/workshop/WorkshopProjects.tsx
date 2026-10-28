import { Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkshopProject = {
  id: string;
  title: string | null;
};

export function WorkshopProjects({
  projects,
  selectedId,
  loading,
  error,
  onCreate,
  onSelect,
}: {
  projects: WorkshopProject[];
  selectedId: string | null;
  loading: boolean;
  error: boolean;
  onCreate: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <aside
      aria-label="פרויקטים"
      className="flex w-full shrink-0 flex-row items-center gap-2 border-b border-[rgb(136_193_255/26%)] bg-[#0a1526] px-2 py-1.5 text-slate-100 md:min-h-0 md:w-72 md:flex-col md:items-stretch md:gap-0 md:overflow-hidden md:border-b-0 md:border-l md:px-0 md:py-0"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 md:border-b md:border-[rgb(136_193_255/26%)] md:px-3 md:py-2">
        <span className="text-sm font-medium">פרויקטים</span>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-[rgb(136_193_255/40%)] px-2 text-sm text-sky-100 hover:bg-white/10"
        >
          <Plus className="h-3.5 w-3.5" />
          חדש
        </button>
      </div>
      <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto md:min-h-0 md:w-full md:flex-col md:overflow-y-auto md:p-2">
        {loading ? (
          <Loader2 className="mx-auto mt-6 h-4 w-4 animate-spin" />
        ) : error ? (
          <p className="p-2 text-sm text-red-300">
            לא הצלחנו לטעון את הפרויקטים
          </p>
        ) : projects.length ? (
          projects.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-right text-sm text-slate-200 hover:bg-white/10 md:mb-1 md:w-full md:whitespace-normal",
                selectedId === item.id && "bg-white/15 font-medium text-white",
              )}
            >
              {item.title?.trim() || "ללא שם"}
            </button>
          ))
        ) : (
          <p className="shrink-0 p-2 text-sm text-slate-400">
            אין פרויקטים עדיין
          </p>
        )}
      </div>
    </aside>
  );
}
