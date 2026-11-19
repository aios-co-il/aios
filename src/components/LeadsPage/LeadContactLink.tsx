import type { ReactNode } from "react";
import { Copy, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type LeadContactKind = "phone" | "email";

interface LeadContactLinkProps {
  kind: LeadContactKind;
  value: string;
  className?: string;
  /** Trigger content; defaults to the value itself. */
  children?: ReactNode;
}

/** A lead phone or email that opens a menu to call/send or copy the value. */
export function LeadContactLink({
  kind,
  value,
  className,
  children,
}: LeadContactLinkProps) {
  const isPhone = kind === "phone";
  return (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger
        className={className}
        title={value}
        // Table rows and kanban cards open the lead on click; keep this menu local.
        onClick={(event) => event.stopPropagation()}
      >
        {children ?? value}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuItem asChild className="gap-2">
          <a href={isPhone ? `tel:${value}` : `mailto:${value}`}>
            {isPhone ? (
              <Phone className="h-4 w-4" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            {isPhone ? "התקשר" : "שלח מייל"}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2"
          onSelect={() => copyContactValue(kind, value)}
        >
          <Copy className="h-4 w-4" />
          {isPhone ? "העתק טלפון" : "העתק אימייל"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Copies the value and reports the outcome in a toast. */
function copyContactValue(kind: LeadContactKind, value: string) {
  const label = kind === "phone" ? "הטלפון" : "האימייל";
  navigator.clipboard
    .writeText(value)
    .then(() => toast.success(`${label} הועתק`))
    .catch((error: unknown) => {
      console.error("Failed to copy lead contact", error);
      toast.error(`לא ניתן להעתיק את ${label}`);
    });
}
