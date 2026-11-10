import { cn } from "@/lib/utils";

/** "AIOS / CARMEN" lockup: the product name, the accent slash, the assistant. */
export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span
      dir="ltr"
      aria-label="AIOS"
      className={cn(
        "inline-flex items-baseline gap-1.5 text-xl font-extrabold tracking-tight",
        className,
      )}
    >
      <span>AIOS</span>
      <span aria-hidden="true" className="text-primary">
        /
      </span>
      <span aria-hidden="true">CARMEN</span>
    </span>
  );
}
