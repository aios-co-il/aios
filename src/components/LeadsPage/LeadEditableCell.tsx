import { useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";

import { LeadCellEditor, type LeadCellEditorKind } from "./LeadCellEditor";

interface LeadEditableCellProps {
  kind: LeadCellEditorKind;
  /** The stored value as the field edits it; empty when unset. */
  value: string;
  /** Names the field for the tooltip, e.g. "טלפון". */
  label: string;
  /** Receives the trimmed draft, only when it differs from `value`. */
  onSave: (next: string) => void;
  /**
   * "cell" edits on a click anywhere on the value. "icon" keeps the value's
   * own clicks (open, call, copy, select text) and adds a pencil on hover.
   */
  trigger?: "cell" | "icon";
  /** What the cell shows while it is not being edited. */
  children: ReactNode;
}

/**
 * A leads-table cell that turns into a field in place. The value closes the
 * field as soon as it is committed; the caller saves it and shows it at once.
 */
export function LeadEditableCell({
  kind,
  value,
  label,
  onSave,
  trigger = "cell",
  children,
}: LeadEditableCellProps) {
  const [editing, setEditing] = useState(false);
  const title = `עריכת ${label}`;

  function commit(draft: string) {
    const next = draft.trim();
    setEditing(false);
    if (next !== value.trim()) {
      onSave(next);
    }
  }

  if (editing) {
    return (
      <LeadCellEditor
        kind={kind}
        initialValue={value}
        onCommit={commit}
        onCancel={() => setEditing(false)}
      />
    );
  }

  if (trigger === "icon") {
    return (
      <div className="group/edit flex min-w-0 items-center gap-1">
        <div className="min-w-0 flex-1">{children}</div>
        <button
          type="button"
          title={title}
          aria-label={title}
          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-brand-accent-700 focus-visible:opacity-100 group-hover/edit:opacity-100 dark:hover:text-brand-accent-300"
          onClick={(event) => {
            event.stopPropagation();
            setEditing(true);
          }}
        >
          <Pencil className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      title={title}
      className="min-w-0 cursor-text rounded hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={(event) => {
        event.stopPropagation();
        setEditing(true);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          setEditing(true);
        }
      }}
    >
      {children}
    </div>
  );
}
