import { History, PanelRightClose } from "lucide-react";

interface CommandCenterSidecarHeaderProps {
  session: boolean;
  name: string;
  path: string;
  onToggleHistory: () => void;
  onClose?: () => void;
}

/** Sidecar title row with the history toggle and the end-session control. */
export function CommandCenterSidecarHeader({
  session,
  name,
  path,
  onToggleHistory,
  onClose,
}: CommandCenterSidecarHeaderProps) {
  return (
    <header className="cc-sidecar-header flex shrink-0 items-center justify-between gap-2 border-b border-[var(--cc-line)] px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-[var(--cc-accent)]">
          {session ? `${name} · איתך במערכת` : "כרמן · תיקון מערכת"}
        </p>
        <p
          className="truncate text-[10px] text-[var(--cc-text-dim)]"
          title={path}
        >
          {session ? "פגישת עבודה" : path}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          title="היסטוריית שיחות"
          aria-label="היסטוריית שיחות"
          onClick={onToggleHistory}
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
  );
}
