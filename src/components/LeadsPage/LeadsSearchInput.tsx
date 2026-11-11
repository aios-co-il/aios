import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Searches leads by name, phone or company, with a clear button. */
export function LeadsSearchInput({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        placeholder="חיפוש לפי שם, טלפון או חברה..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-xl border-transparent bg-muted pr-9 text-sm shadow-none focus-visible:border-brand-accent-400 focus-visible:bg-card"
      />
      {value && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onChange("")}
          className="absolute left-1 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full"
          title="נקה חיפוש"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
