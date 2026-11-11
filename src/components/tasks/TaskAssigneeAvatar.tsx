import { cn } from "@/lib/utils";

/** A round initials badge for the staff member a task is assigned to. */
export function TaskAssigneeAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      title={name}
      aria-label={`משויכת ל${name}`}
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-accent-100 text-[10px] font-bold text-brand-accent-800 ring-2 ring-card dark:bg-brand-accent-900 dark:text-brand-accent-200",
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/** The first letter of the first two words: "דנה לוי" → "דל". */
function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("");
}
