import { useCarmenIdentity } from "@/hooks/useCarmenIdentity";
import { useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { CarmenChatBar, CarmenChatBarHandle } from "./CarmenChatBar";
import { BrainRouteSelector } from "./BrainRouteSelector";
import { CarmenSkinSwitcher } from "./CarmenSkinSwitcher";
import { useDraggableCard } from "./useDraggableCard";
import { useBrainChannel } from "./useBrainChannel";
import { useSystemFixContext } from "@/hooks/useSystemFixContext";
import type { CarmenFaceState } from "./CarmenFace";
import { CommandCenterSidecarHeader } from "./CommandCenterSidecarHeader";
import { CarmenSessionVideoCard } from "./CarmenSessionVideoCard";
import { useSidecarSessionDefaults } from "./useSidecarSessionDefaults";
import "@/components/carmen-command/command-center.css";

interface CommandCenterSidecarProps {
  onClose?: () => void;
  className?: string;
  session?: boolean;
  /** Carmen opened as a full page instead of the side column. */
  page?: boolean;
  headerActions?: ReactNode;
}

/**
 * Persistent sidecar panel: Carmen text chat with live screen context for system fixes.
 */
export function CommandCenterSidecar({
  onClose,
  className,
  session = false,
  page = false,
  headerActions,
}: CommandCenterSidecarProps) {
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
  useSidecarSessionDefaults(brain, session);

  return (
    <div
      dir="rtl"
      data-face-state={faceState}
      className={`${session ? "carmen-session-panel" : ""} cc-sidecar cc-root flex h-full min-h-0 flex-col overflow-hidden font-heebo ${className ?? ""}`}
    >
      <CommandCenterSidecarHeader
        session={session}
        name={identity.name}
        path={contextMetadata.path}
        onToggleHistory={() => chatRef.current?.toggleHistory()}
        onClose={onClose}
        actions={headerActions}
        subtitle={page ? "מסך מלא" : undefined}
      />

      {session && (
        <CarmenSessionVideoCard
          videoCard={videoCard}
          faceState={faceState}
          onClose={onClose}
          showExpand={!page}
        />
      )}
      {brain.noBrainAccess && (
        <p className="m-3 rounded-lg border border-[var(--cc-line)] p-3 text-center text-sm text-[var(--cc-text-dim)]">
          אין לך הרשאה לאף מוח של כרמן. אפשר לבקש גישה ממנהל המערכת.
        </p>
      )}
      <div
        className={`carmen-session-chat flex min-h-0 flex-1 flex-col overflow-hidden p-2${page ? " mx-auto w-full max-w-4xl" : ""}`}
      >
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
