import { Globe } from "lucide-react";
import { ContactValue } from "@/components/contact/ContactValue";
import type { ClientRow } from "./clientRow";

/** The grid card's website, phone and email, each only when set. */
export function ClientContactLines({ client }: { client: ClientRow }) {
  return (
    <div className="space-y-1.5 text-sm">
      {client.website && <WebsiteLine website={client.website} />}
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

/** The client's website, opened in a new tab. */
function WebsiteLine({ website }: { website: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
      <Globe className="h-4 w-4 shrink-0" />
      <a
        href={website}
        dir="ltr"
        className="truncate hover:text-foreground hover:underline"
        target="_blank"
        rel="noopener noreferrer"
      >
        {website}
      </a>
    </div>
  );
}
