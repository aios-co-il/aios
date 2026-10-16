import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useCommandCenterSidecar } from "@/contexts/CommandCenterSidecarContext";
import { CommandCenterSidecar } from "./CommandCenterSidecar";
import "./carmen-session.css";

const ignoreOpenChange = () => {};

interface CommandCenterSidecarShellProps {
  children: React.ReactNode;
  embedded?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Keep the workspace mounted and interactive throughout a Carmen session. */
export function CommandCenterSidecarShell({
  children,
  embedded = false,
  open: openProp,
  onOpenChange,
}: CommandCenterSidecarShellProps) {
  const ctx = useCommandCenterSidecar();
  const open = embedded ? (openProp ?? false) : ctx.open;
  const setOpen = embedded ? (onOpenChange ?? ignoreOpenChange) : ctx.setOpen;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  return (
    <>
      {children}
      {open &&
        createPortal(
          <aside
            className="carmen-session"
            aria-label="פגישת עבודה עם כרמן"
            dir="rtl"
          >
            <div className="carmen-session-aura" aria-hidden="true" />
            <CommandCenterSidecar onClose={() => setOpen(false)} session />
          </aside>,
          document.body,
        )}
    </>
  );
}
