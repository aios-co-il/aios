import type { SyntheticEvent } from "react";
import { Copy, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type ContactKind = "phone" | "email";

interface ContactValueProps {
  kind: ContactKind;
  value: string;
  className?: string;
}

const CONTACT_LABELS = {
  phone: { action: "התקשר", copy: "העתק טלפון", subject: "הטלפון" },
  email: { action: "שלח מייל", copy: "העתק אימייל", subject: "האימייל" },
} satisfies Record<ContactKind, object>;

const ICON_BUTTON_CLASS =
  "shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-brand-accent-700 dark:hover:text-brand-accent-300";

/**
 * A phone or email as text the mouse can select, with a call or mail icon
 * before it and a copy icon after it.
 */
export function ContactValue({ kind, value, className }: ContactValueProps) {
  const labels = CONTACT_LABELS[kind];
  const ActionIcon = kind === "phone" ? Phone : Mail;
  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1",
        className,
      )}
      // Rows, cards and editable fields act on click and drag; selecting or copying stays local.
      onClick={stopPropagation}
      onPointerDown={stopPropagation}
    >
      <a
        href={kind === "phone" ? `tel:${value}` : `mailto:${value}`}
        title={labels.action}
        aria-label={labels.action}
        className={ICON_BUTTON_CLASS}
      >
        <ActionIcon className="h-3.5 w-3.5" />
      </a>
      <span
        dir="ltr"
        title={value}
        className="min-w-0 cursor-text select-text truncate tabular-nums"
      >
        {value}
      </span>
      <button
        type="button"
        title={labels.copy}
        aria-label={labels.copy}
        className={ICON_BUTTON_CLASS}
        onClick={() => void copyContactValue(kind, value)}
      >
        <Copy className="h-3 w-3" />
      </button>
    </span>
  );
}

/** Keeps an event from reaching the row, card or field around the value. */
function stopPropagation(event: SyntheticEvent) {
  event.stopPropagation();
}

/**
 * Copies the value and reports the outcome in a toast. The Clipboard API is
 * missing outside secure contexts and in some embedded browsers, so its absence
 * reports a failure instead of throwing.
 */
async function copyContactValue(kind: ContactKind, value: string) {
  const { subject } = CONTACT_LABELS[kind];
  try {
    if (!navigator.clipboard) {
      throw new Error("Clipboard API is unavailable");
    }
    await navigator.clipboard.writeText(value);
    toast.success(`${subject} הועתק`);
  } catch (error) {
    console.error("Failed to copy contact value", error);
    toast.error(`לא ניתן להעתיק את ${subject}`);
  }
}
