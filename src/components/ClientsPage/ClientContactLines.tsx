import type { LucideIcon } from "lucide-react";
import { Globe } from "lucide-react";
import { ContactValue } from "@/components/contact/ContactValue";
import type { ClientRow } from "./clientRow";

/** The grid card's website, phone and email, each only when set. */
export function ClientContactLines({ client }: { client: ClientRow }) {
  return (
    <div className="space-y-1.5 text-sm">
      {client.website && (
        <ContactLine icon={Globe} href={client.website} external>
          {client.website}
        </ContactLine>
      )}
      {client.phone && (
        <ContactValue
          kind="phone"
          value={client.phone}
          className="flex text-muted-foreground"
        />
      )}
      {client.email && (
        <ContactValue
          kind="email"
          value={client.email}
          className="flex text-muted-foreground"
        />
      )}
    </div>
  );
}

/** A contact detail with its icon. */
function ContactLine({
  icon: Icon,
  href,
  external = false,
  children,
}: {
  icon: LucideIcon;
  href: string;
  external?: boolean;
  children: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
      <Icon className="h-4 w-4 shrink-0" />
      <a
        href={href}
        dir="ltr"
        className="truncate hover:text-foreground hover:underline"
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
      </a>
    </div>
  );
}
