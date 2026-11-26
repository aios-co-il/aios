import { useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Check } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** The fields a table cell can turn into. */
export type LeadCellEditorKind =
  "text" | "textarea" | "number" | "date" | "email" | "tel";

interface LeadCellEditorProps {
  kind: LeadCellEditorKind;
  /** The value the field opens with. */
  initialValue: string;
  /** True while a save is in flight: the field and the ✓ wait. */
  disabled?: boolean;
  onCommit: (draft: string) => void;
  onCancel: () => void;
}

/**
 * A table cell's field while it is being edited, with a small ✓ beside it.
 * The ✓, Enter (Ctrl+Enter in a multi-line field) and leaving the field all
 * commit the draft; Esc cancels.
 */
export function LeadCellEditor({
  kind,
  initialValue,
  disabled,
  onCommit,
  onCancel,
}: LeadCellEditorProps) {
  const [draft, setDraft] = useState(initialValue);
  // Esc closes the field, and the blur that follows must not save the draft.
  const cancelled = useRef(false);

  function handleBlur() {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    onCommit(draft);
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    event.stopPropagation();
    if (event.key === "Escape") {
      cancelled.current = true;
      onCancel();
      return;
    }

    const commits =
      event.key === "Enter" &&
      (kind !== "textarea" || event.metaKey || event.ctrlKey);
    if (commits) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  }

  const field = {
    autoFocus: true,
    value: draft,
    disabled,
    dir: kind === "text" || kind === "textarea" ? "rtl" : "ltr",
    onClick: stopRowClick,
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
  };

  return (
    <div
      className="flex w-full min-w-0 items-start gap-1"
      onClick={stopRowClick}
    >
      {kind === "textarea" ? (
        <Textarea
          {...field}
          rows={3}
          className="min-h-[72px] px-2 py-1 text-right"
          onChange={(event) => setDraft(event.target.value)}
        />
      ) : (
        <Input
          {...field}
          type={kind}
          className="h-8 min-w-0 px-2 text-right"
          onChange={(event) => setDraft(event.target.value)}
        />
      )}
      {/* Pressing ✓ takes focus from the field, which commits; the click
          covers a field that is no longer focused, e.g. after a failed save. */}
      <button
        type="button"
        disabled={disabled}
        title="שמור"
        aria-label="שמור"
        className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        onClick={() => onCommit(draft)}
      >
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Keeps a click inside the editor from reaching the table row. */
function stopRowClick(event: MouseEvent) {
  event.stopPropagation();
}
