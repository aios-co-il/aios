import { Building2, Phone } from "lucide-react";

/** The lead's name with an initials avatar; opens the lead record. */
export function LeadNameCell({
  name,
  onOpen,
}: {
  name: string | null | undefined;
  onOpen?: () => void;
}) {
  return (
    <button
      type="button"
      className="group/name flex w-full min-w-0 items-center gap-2 text-right"
      title="פרטי ליד"
      onClick={onOpen}
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-accent-100 text-[11px] font-bold text-brand-accent-800 dark:bg-brand-accent-900 dark:text-brand-accent-100"
        aria-hidden="true"
      >
        {initials(name)}
      </span>
      <span className="truncate font-semibold text-foreground group-hover/name:text-brand-accent-700 dark:group-hover/name:text-brand-accent-300">
        {name || "-"}
      </span>
    </button>
  );
}

/** A dialable phone number, kept left-to-right inside the RTL row. */
export function LeadPhoneCell({ phone }: { phone: string | null | undefined }) {
  if (!phone) {
    return <span className="text-muted-foreground">-</span>;
  }
  return (
    <a
      href={`tel:${phone}`}
      className="flex min-w-0 items-center gap-1.5 text-foreground hover:text-brand-accent-700 dark:hover:text-brand-accent-300"
    >
      <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span dir="ltr" className="truncate tabular-nums">
        {phone}
      </span>
    </a>
  );
}

/** The lead's company with a muted building icon. */
export function LeadCompanyCell({
  company,
}: {
  company: string | null | undefined;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{company}</span>
    </div>
  );
}

/** Up to two initials from a Hebrew or Latin name; "?" when empty. */
function initials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
}
