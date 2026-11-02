import { useCallback } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, ListTodo, Settings } from "lucide-react";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { useCommandCenterAccess } from "@/components/carmen-command/access";
import { CarmenPanel } from "@/components/carmen-command/CarmenPanel";
import { CommandCenterSidecar } from "@/components/carmen-command/CommandCenterSidecar";
import { useCarmenTasks } from "@/components/carmen-command/useCarmenTasks";
import { countRunning } from "@/lib/carmenTaskRows";

import "@/components/carmen-command/command-center.css";
import "@/components/carmen-command/carmen-session.css";

/** Kept for the screen-context helpers that still name the old view. */
export type CommandCenterViewMode = "agents" | "dashboard";

const headerBtn =
  "cc-header-btn flex h-8 items-center gap-1 rounded-md border px-2 text-xs";
const idle =
  "border-[var(--cc-line)] text-[var(--cc-text-dim)] hover:border-[var(--cc-line-strong)] hover:text-[var(--cc-accent)]";
const active = "border-[var(--cc-line-strong)] text-[var(--cc-accent)]";

/**
 * Carmen as a full page: the same Carmen as the side column (brain picker,
 * skin picker, chat history), plus one right-side panel (?panel=<path>) for
 * tasks and every setting.
 */
export default function CarmenCommandCenter() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { tenantId } = useCurrentTenant();
  const access = useCommandCenterAccess();
  const [searchParams, setSearchParams] = useSearchParams();
  // ?panel=<path>; the legacy ?settings=<section> link (agent editor, old
  // bookmarks) maps onto it.
  const legacySettings = searchParams.get("settings");
  const panelParam =
    searchParams.get("panel") ??
    (legacySettings === null
      ? null
      : legacySettings
        ? `settings/${legacySettings}`
        : "");
  const panelOpen = panelParam !== null;
  const tasksOpen = panelOpen && !!panelParam?.startsWith("task");
  const setPanel = useCallback(
    (value: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("settings");
          if (value === null) next.delete("panel");
          else next.set("panel", value);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const { data: tasksData } = useCarmenTasks(tenantId);
  const runningCount = countRunning(tasksData?.rows ?? []);

  if (access.loading) return <div className="cc-root h-full" />;
  if (!access.allowed)
    return <Navigate to={tenantSlug ? `/t/${tenantSlug}` : "/"} replace />;

  const headerActions = (
    <>
      <Link
        to={tenantSlug ? `/t/${tenantSlug}` : "/"}
        title="חזרה לאפליקציה"
        className={`${headerBtn} ${idle}`}
      >
        <ArrowRight className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">חזרה</span>
      </Link>
      <button
        type="button"
        onClick={() => setPanel("tasks")}
        title="משימות כרמן"
        className={`${headerBtn} ${tasksOpen ? active : idle}`}
      >
        <ListTodo className="h-4 w-4" />
        <span className="hidden sm:inline">משימות</span>
        {runningCount > 0 && (
          <span className="rounded-full bg-[var(--cc-accent)] px-1.5 text-[10px] font-bold text-black">
            {runningCount}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={() => setPanel("")}
        title="הגדרות כרמן"
        className={`${headerBtn} ${panelOpen && !tasksOpen ? active : idle}`}
      >
        <Settings className="h-4 w-4" />
        <span className="hidden sm:inline">הגדרות</span>
      </button>
    </>
  );

  return (
    <div
      dir="rtl"
      className="cc-root relative flex min-h-0 flex-col overflow-hidden font-heebo"
    >
      <CommandCenterSidecar
        session
        page
        headerActions={headerActions}
        className="min-h-0 flex-1"
      />
      <CarmenPanel
        open={panelOpen}
        path={panelParam ?? ""}
        onNavigate={setPanel}
        onClose={() => setPanel(null)}
        tenantId={tenantId}
      />
    </div>
  );
}
