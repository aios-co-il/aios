import type { SyntheticEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { Copy, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type ContactKind = "phone" | "email";

interface ContactValueProps {
  kind: ContactKind;
  value: string;
  className?: string;
}

/** What differs between a phone and an email: icon, link scheme and labels. */
interface ContactKindConfig {
  icon: LucideIcon;
  scheme: "tel:" | "mailto:";
  action: string;
  copy: string;
  subject: string;
}

const CONTACT_KINDS: Record<ContactKind, ContactKindConfig> = {
  phone: {
    icon: Phone,
    scheme: "tel:",
    action: "התקשר",
    copy: "העתק טלפון",
    subject: "הטלפון",
  },
  email: {
    icon: Mail,
    scheme: "mailto:",
    action: "שלח מייל",
    copy: "העתק אימייל",
    subject: "האימייל",
  },
};

const ICON_BUTTON_CLASS =
  "shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-brand-accent-700 dark:hover:text-brand-accent-300";

/**
 * A phone or email as text the mouse can select, with a call or mail icon
 * before it and a copy icon after it.
 */
export function ContactValue({ kind, value, className }: ContactValueProps) {
  const { icon: ActionIcon, scheme, action, copy } = CONTACT_KINDS[kind];

  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1",
        className,
      )}
      // Rows, cards and editable fields act on click; selecting or copying stays local.
      onClick={stopPropagation}
    >
      <a
        href={`${scheme}${value}`}
        title={action}
        aria-label={`${action} ${value}`}
        className={ICON_BUTTON_CLASS}
      >
        <ActionIcon className="h-4 w-4" />
      </a>
      <span
        dir="ltr"
        title={value}
        className="min-w-0 cursor-text select-text truncate tabular-nums"
        onMouseDown={swallowClickAfterDragSelect}
      >
        {value}
      </span>
      <button
        type="button"
        title={copy}
        aria-label={`${copy} ${value}`}
        className={ICON_BUTTON_CLASS}
        onClick={() => void copyContactValue(kind, value)}
      >
        <Copy className="h-4 w-4" />
      </button>
    </span>
  );
}

/** Keeps an event from reaching the row, card or field around the value. */
function stopPropagation(event: SyntheticEvent) {
  event.stopPropagation();
}

/**
 * A drag that starts on the value and ends outside it clicks their common
 * ancestor, past the wrapper's own handler, and would open the row or start
 * editing. Swallows that one click when the drag left text selected.
 */
function swallowClickAfterDragSelect() {
  window.addEventListener("click", swallowClickWhileTextIsSelected, {
    capture: true,
  });
  window.addEventListener("mouseup", stopSwallowingAfterThisClick, {
    once: true,
  });
}

/** Stops a click before any handler sees it while text is selected. */
function swallowClickWhileTextIsSelected(event: MouseEvent) {
  if (window.getSelection()?.toString()) {
    event.stopPropagation();
  }
}

/** The click follows mouseup in the same task; drop the guard right after it. */
function stopSwallowingAfterThisClick() {
  setTimeout(() => {
    window.removeEventListener("click", swallowClickWhileTextIsSelected, {
      capture: true,
    });
  });
}

/**
 * Copies the value and reports the outcome in a toast. The Clipboard API is
 * missing outside secure contexts and in some embedded browsers, so its absence
 * reports a failure instead of throwing.
 */
async function copyContactValue(kind: ContactKind, value: string) {
  const { subject } = CONTACT_KINDS[kind];
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
