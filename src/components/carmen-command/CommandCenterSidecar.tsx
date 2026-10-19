import { useNavigate } from "react-router-dom";
import { useTenantPath } from "@/hooks/useTenantPath";
import { useCarmenIdentity } from "@/hooks/useCarmenIdentity";
import { useEffect, useRef, useState } from "react";
import { History, PanelRightClose, Maximize2, X } from "lucide-react";
import { CarmenChatBar, CarmenChatBarHandle } from "./CarmenChatBar";
import { BrainRouteSelector } from "./BrainRouteSelector";
import { CarmenSkinSwitcher } from "./CarmenSkinSwitcher";
import { useDraggableCard } from "./useDraggableCard";
import { useCarmenSkins } from "@/hooks/useCarmenSkins";
import { useBrainChannel } from "./useBrainChannel";
import { useSystemFixContext } from "@/hooks/useSystemFixContext";
import type { CarmenFaceState } from "./CarmenFace";
import "@/components/carmen-command/command-center.css";

interface CommandCenterSidecarProps {
  onClose?: () => void;
  className?: string;
  session?: boolean;
}

/**
 * Persistent sidecar panel: Carmen text chat with live screen context for system fixes.
 */
export function CommandCenterSidecar({
  onClose,
  className,
  session = false,
}: CommandCenterSidecarProps) {
  const navigate = useNavigate();
  const { buildPath, isReady } = useTenantPath();
  const identity = useCarmenIdentity();
  const contextMetadata = useSystemFixContext();
  const tenantId = contextMetadata.tenant_id ?? null;
  const brain = useBrainChannel(tenantId);
  const chatRef = useRef<CarmenChatBarHandle>(null);
  const [faceState, setFaceState] = useState<CarmenFaceState>("idle");
  const audioLevelRef = useRef(0);
  const videoCard = useDraggableCard("aios:carmen-video-pos", {
    x: 24,
    y: 88,
  });

  // The session opens on Carmen's internal brain once; after that the brain
  // selector in the header owns the choice.
  const initialBrainApplied = useRef(false);
  useEffect(() => {
    if (initialBrainApplied.current) return;
    const internal = brain.routes.find((r) => r.slug === "internal");
    if (!internal) return;
    initialBrainApplied.current = true;
    if (brain.selected.slug !== "internal") brain.selectRoute(internal, null);
  }, [brain.routes, brain.selected.slug, brain]);

  // Each session opens on Carmen's base skin; a skin is picked per task.
  const carmenSkins = useCarmenSkins();
  const initialSkinApplied = useRef(false);
  useEffect(() => {
    if (!session || initialSkinApplied.current || carmenSkins.isLoading) return;
    if (!carmenSkins.canEdit) return;
    initialSkinApplied.current = true;
    if (carmenSkins.activeSlug) carmenSkins.setActiveSkin(null).catch(() => {});
  }, [session, carmenSkins]);

  return (
    <div
      dir="rtl"
      data-face-state={faceState}
      className={`${session ? "carmen-session-panel" : ""} cc-sidecar cc-root flex h-full min-h-0 flex-col overflow-hidden font-heebo ${className ?? ""}`}
    >
      <header className="cc-sidecar-header flex shrink-0 items-center justify-between gap-2 border-b border-[var(--cc-line)] px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[var(--cc-accent)]">
            {session ? `${identity.name} · איתך במערכת` : "כרמן · תיקון מערכת"}
          </p>
          <p
            className="truncate text-[10px] text-[var(--cc-text-dim)]"
            title={contextMetadata.path}
          >
            {session ? "פגישת עבודה" : contextMetadata.path}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            title="היסטוריית שיחות"
            aria-label="היסטוריית שיחות"
            onClick={() => chatRef.current?.toggleHistory()}
            className="cc-header-btn flex h-8 w-8 items-center justify-center rounded-md border border-[var(--cc-line)] text-[var(--cc-text-dim)] hover:border-[var(--cc-line-strong)] hover:text-[var(--cc-accent)]"
          >
            <History className="h-4 w-4" />
          </button>
          {onClose && (
            <button
              type="button"
              title="סיום הפגישה"
              aria-label="סיום הפגישה"
              onClick={onClose}
              className="cc-header-btn flex h-8 w-8 items-center justify-center rounded-md border border-[var(--cc-line)] text-[var(--cc-text-dim)] hover:border-[var(--cc-line-strong)] hover:text-[var(--cc-accent)]"
            >
              <PanelRightClose className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {session && (
        <div
          ref={videoCard.ref}
          className="carmen-session-video"
          aria-label={identity.name}
          title="אפשר לגרור את החלון"
          style={videoCard.style}
          {...videoCard.handlers}
        >
          <button
            type="button"
            title="פתח במסך מלא — הגדרות וכלים"
            aria-label={`פתח את ${identity.name} במסך מלא — הגדרות וכלים`}
            disabled={!isReady}
            onClick={() => {
              navigate(buildPath("command-center"));
              onClose?.();
            }}
            className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-slate-950/60 text-white backdrop-blur-sm transition-colors hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 disabled:opacity-40"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <img
            key={identity.image}
            src={identity.image}
            alt=""
            className={`carmen-session-character ${identity.custom ? "is-custom" : ""}`}
          />
          <div className="carmen-session-caption">
            <span className="carmen-session-dot" />
            {identity.name}
            <span>
              {faceState === "listening"
                ? "מקשיבה"
                : faceState === "speaking"
                  ? "מדברת"
                  : "איתך"}
            </span>
          </div>
        </div>
      )}
      {brain.noBrainAccess && (
        <p className="m-3 rounded-lg border border-[var(--cc-line)] p-3 text-center text-sm text-[var(--cc-text-dim)]">
          אין לך הרשאה לאף מוח של כרמן. אפשר לבקש גישה ממנהל המערכת.
        </p>
      )}
      <div className="carmen-session-chat flex min-h-0 flex-1 flex-col overflow-hidden p-2">
        <CarmenChatBar
          ref={chatRef}
          tenantId={tenantId}
          brain={brain}
          onFaceState={setFaceState}
          audioLevelRef={audioLevelRef}
          mode="sidecar"
          startFresh={session}
          contextMetadata={contextMetadata}
          composerAccessory={
            session ? (
              <div className="grid w-full grid-cols-2 gap-2">
                <BrainRouteSelector
                  routes={brain.routes}
                  value={brain.selected.id}
                  status={brain.status}
                  externalUrl={brain.externalUrl}
                  onChange={(route) => brain.selectRoute(route, null)}
                  compact
                  className="min-w-0"
                />
                <CarmenSkinSwitcher className="h-9 w-full min-w-0" />
              </div>
            ) : undefined
          }
          sidecarPlaceholder={
            session
              ? `מה נעשה יחד? כתוב ל${identity.name}…`
              : "תאר תיקון או בקשה למסך הזה…"
          }
        />
      </div>
      <span className="sr-only" aria-live="polite">
        {faceState}
      </span>
    </div>
  );
}

/** Compact close control for mobile sheet header. */
export function CommandCenterSidecarSheetHeader({
  onClose,
}: {
  onClose: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="absolute left-3 top-3 rounded-sm opacity-70 hover:opacity-100"
      aria-label="סגור"
    >
      <X className="h-4 w-4" />
    </button>
  );
}
