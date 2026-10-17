import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  History,
  LayoutDashboard,
  ListTodo,
  MessageSquare,
  Settings,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { useCommandCenterAccess } from "@/components/carmen-command/access";
import type { CarmenFaceState } from "@/components/carmen-command/CarmenFace";
import { CarmenDashboardView } from "@/components/carmen-command/CarmenDashboardView";
import {
  AgentSeatSelect,
  AgentSeatStatus,
} from "@/components/carmen-command/AgentSeatRail";
import { CarmenPanel } from "@/components/carmen-command/CarmenPanel";
import { useCarmenTasks } from "@/components/carmen-command/useCarmenTasks";
import { countRunning } from "@/lib/carmenTaskRows";
import {
  CarmenChatBar,
  CarmenChatBarHandle,
} from "@/components/carmen-command/CarmenChatBar";
import { useCommandRealtime } from "@/components/carmen-command/useCommandData";
import { useBrainChannel } from "@/components/carmen-command/useBrainChannel";
import { useToast } from "@/hooks/use-toast";
import type { HudStage } from "@/lib/agentChannelRouting";

import "@/components/carmen-command/command-center.css";

export type CommandCenterViewMode = "agents" | "dashboard";

const VIEW_MODE_KEY = "aios:cc-view-mode";

function readViewMode(): CommandCenterViewMode {
  try {
    const v = localStorage.getItem(VIEW_MODE_KEY);
    // Goals and dev tasks moved into the tasks panel.
    return v === "dashboard" ? "dashboard" : "agents";
  } catch {
    return "agents";
  }
}

function Clock({ compact = false }: { compact?: boolean }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div
      className={`cc-header-clock text-left leading-tight${compact ? " cc-header-clock--compact" : ""}`}
    >
      <p className="cc-num text-sm font-bold sm:text-base">
        {now.toLocaleTimeString("he-IL", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </p>
      {!compact && (
        <p className="hidden text-[10px] text-[var(--cc-text-dim)] sm:block">
          {now.toLocaleDateString("he-IL", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
      )}
    </div>
  );
}

/**
 * Carmen — one screen for everything Carmen:
 * - clean chat with collapsible chat history
 * - one right-side panel (?panel=<path>) for every task kind and every
 *   setting, so nothing navigates away from this screen
 *
 * Carmen system-fix sidecar lives in AppLayout (outside this page).
 */
export default function CarmenCommandCenter() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { tenantId } = useCurrentTenant();
  const access = useCommandCenterAccess();
  const qc = useQueryClient();
  const [faceState, setFaceState] = useState<CarmenFaceState>("idle");
  const audioLevelRef = useRef(0);
  const chatRef = useRef<CarmenChatBarHandle>(null);
  const alertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, setHudMode] = useState<HudStage>("direct");
  const [chatsOpen, setChatsOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<CommandCenterViewMode>(readViewMode);
  const brain = useBrainChannel(tenantId);
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  // One right-side panel for tasks + settings: ?panel=<path>. The legacy
  // ?settings=<section> link (agent editor, old bookmarks) maps onto it.
  const legacySettings = searchParams.get("settings");
  const panelParam =
    searchParams.get("panel") ??
    (legacySettings === null
      ? null
      : legacySettings
        ? `settings/${legacySettings}`
        : "");
  const panelOpen = panelParam !== null;
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

  const flashAlert = useCallback(() => {
    setFaceState((prev) => {
      if (prev === "speaking" || prev === "listening") return prev;
      if (alertTimer.current) clearTimeout(alertTimer.current);
      alertTimer.current = setTimeout(
        () => setFaceState((p) => (p === "alert" ? "idle" : p)),
        4000,
      );
      return "alert";
    });
  }, []);
  useCommandRealtime(tenantId, flashAlert);
  useEffect(
    () => () => {
      if (alertTimer.current) clearTimeout(alertTimer.current);
    },
    [],
  );

  const healthCheck = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["cc-health", tenantId] });
    qc.invalidateQueries({ queryKey: ["cc-feed", tenantId] });
  }, [qc, tenantId]);

  const switchViewMode = useCallback((mode: CommandCenterViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (viewMode !== "dashboard") return;
    const internal = brain.routes.find((r) => r.slug === "internal");
    if (internal && brain.selected.slug !== "internal") {
      brain.selectRoute(internal, conversationId);
    }
  }, [viewMode, brain.routes, brain.selected.slug, brain, conversationId]);

  const onCancelParliament = conversationId
    ? () => brain.cancelParliament(conversationId)
    : undefined;
  const onContinueParliament = conversationId
    ? () =>
        brain
          .parliamentAction("parliament_continue", conversationId)
          .catch((e) =>
            toast({
              title: "שגיאה",
              description: e.message,
              variant: "destructive",
            }),
          )
    : undefined;
  const onSynthesizeParliament = conversationId
    ? () =>
        brain
          .parliamentAction("parliament_synthesize", conversationId)
          .catch((e) =>
            toast({
              title: "שגיאה",
              description: e.message,
              variant: "destructive",
            }),
          )
    : undefined;

  if (access.loading) return <div className="cc-root h-full" />;
  if (!access.allowed)
    return <Navigate to={tenantSlug ? `/t/${tenantSlug}` : "/"} replace />;

  const isDashboard = viewMode === "dashboard";

  return (
    <div
      dir="rtl"
      className={`cc-root relative flex flex-col overflow-hidden font-heebo${isDashboard ? " is-dashboard" : ""}`}
    >
      <header className="cc-header-bar shrink-0">
        <div className="cc-header-bar__brand flex min-w-0 items-center gap-1.5 sm:gap-2">
          <Link
            to={tenantSlug ? `/t/${tenantSlug}` : "/"}
            title="חזרה לאפליקציה"
            className="cc-header-btn flex items-center gap-1 rounded-md border border-[var(--cc-line)] px-2 text-xs text-[var(--cc-text-dim)] hover:border-[var(--cc-line-strong)] hover:text-[var(--cc-text)]"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">חזרה</span>
          </Link>
          <h1 className="cc-title hidden text-sm font-bold text-[var(--cc-accent)] sm:block sm:text-base">
            כרמן
          </h1>
          <span className="hidden text-[10px] tracking-[0.12em] text-[var(--cc-text-dim)] md:inline">
            מנהלת שיווק
          </span>
          {!isDashboard && (
            <button
              type="button"
              onClick={() => setChatsOpen((v) => !v)}
              title="צ׳אטים"
              className={`cc-header-btn flex items-center gap-1 rounded-md border px-2 text-xs ${chatsOpen ? "border-[var(--cc-line-strong)] text-[var(--cc-accent)]" : "border-[var(--cc-line)] text-[var(--cc-text-dim)]"}`}
            >
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">צ׳אטים</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setPanel("tasks")}
            title="משימות כרמן"
            className={`cc-header-btn flex items-center gap-1 rounded-md border px-2 text-xs ${panelOpen && panelParam?.startsWith("task") ? "border-[var(--cc-line-strong)] text-[var(--cc-accent)]" : "border-[var(--cc-line)] text-[var(--cc-text-dim)] hover:border-[var(--cc-line-strong)]"}`}
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
            className={`cc-header-btn flex items-center gap-1 rounded-md border px-2 text-xs ${panelOpen && !panelParam?.startsWith("task") ? "border-[var(--cc-line-strong)] text-[var(--cc-accent)]" : "border-[var(--cc-line)] text-[var(--cc-text-dim)] hover:border-[var(--cc-line-strong)]"}`}
          >
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">הגדרות</span>
          </button>
        </div>

        <div className="cc-header-bar__tools flex shrink-0 items-center gap-1.5 sm:gap-2">
          {!isDashboard && (
            <AgentSeatSelect
              routes={brain.routes}
              selected={brain.selected}
              onSelect={(route) => brain.selectRoute(route, null)}
              className="h-8 w-36 text-xs sm:w-44"
            />
          )}
          <button
            type="button"
            onClick={() => switchViewMode(isDashboard ? "agents" : "dashboard")}
            title={isDashboard ? "חזרה לצ׳אט" : "לוח בקרה"}
            className="cc-header-btn flex items-center gap-1 rounded-md border border-[var(--cc-line)] px-2 text-xs text-[var(--cc-text-dim)] hover:border-[var(--cc-line-strong)]"
          >
            {isDashboard ? (
              <MessageSquare className="h-4 w-4" />
            ) : (
              <LayoutDashboard className="h-4 w-4" />
            )}
            <span className="hidden md:inline">
              {isDashboard ? "צ׳אט" : "לוח בקרה"}
            </span>
          </button>
          <div className="hidden sm:block">
            <Clock compact />
          </div>
        </div>
      </header>

      {!isDashboard && (
        <AgentSeatStatus
          selected={brain.selected}
          status={brain.status}
          externalUrl={brain.externalUrl}
          debating={brain.status === "debating"}
          onCancel={onCancelParliament}
          onContinue={onContinueParliament}
          onSynthesize={onSynthesizeParliament}
        />
      )}

      {isDashboard ? (
        <CarmenDashboardView
          tenantId={tenantId}
          faceState={faceState}
          audioLevelRef={audioLevelRef}
          chatRef={chatRef}
          onHealthCheck={healthCheck}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 sm:p-3">
          <CarmenChatBar
            ref={chatRef}
            tenantId={tenantId}
            brain={brain}
            onConversationIdChange={setConversationId}
            onFaceState={setFaceState}
            audioLevelRef={audioLevelRef}
            historyOpen={chatsOpen}
            onHistoryOpenChange={setChatsOpen}
            onHudModeChange={setHudMode}
          />
        </div>
      )}

      <CarmenPanel
        open={panelOpen}
        path={panelParam ?? ""}
        onNavigate={setPanel}
        onClose={() => setPanel(null)}
        tenantId={tenantId}
      />

      {isDashboard && (
        <footer className="cc-dashboard-footer shrink-0 p-2 pt-0 sm:p-3 sm:pt-0">
          <CarmenChatBar
            ref={chatRef}
            tenantId={tenantId}
            brain={brain}
            onConversationIdChange={setConversationId}
            onFaceState={setFaceState}
            audioLevelRef={audioLevelRef}
            onHudModeChange={setHudMode}
          />
        </footer>
      )}
    </div>
  );
}
