import { cn } from "@/lib/utils";
import { CLIENT_STATUS_META, clientStatusOf } from "./clientStatusMeta";

const SIZE_CLASS = {
  sm: "h-9 w-9 text-sm",
  md: "h-11 w-11 text-base",
  lg: "h-14 w-14 text-xl",
} as const;

/**
 * A client's initial on a soft accent tile, with its status as a dot on the
 * corner, so a list scans by name first and status second.
 */
export function ClientAvatar({
  name,
  status,
  size = "md",
}: {
  name: string;
  status: string | null;
  size?: keyof typeof SIZE_CLASS;
}) {
  const meta = CLIENT_STATUS_META[clientStatusOf(status)];
  return (
    <span className="relative inline-flex shrink-0">
      <span
        className={cn(
          "flex items-center justify-center rounded-xl bg-brand-accent-100 font-bold text-brand-accent-800 dark:bg-brand-accent-900/50 dark:text-brand-accent-200",
          SIZE_CLASS[size],
        )}
        aria-hidden="true"
      >
        {initialOf(name)}
      </span>
      <span
        className={cn(
          "absolute -bottom-0.5 -start-0.5 h-3 w-3 rounded-full ring-2 ring-card",
          meta.dotClass,
        )}
        title={meta.label}
      />
    </span>
  );
}

/** The first visible character of a name, or "?" when it is empty. */
function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? "?";
}
