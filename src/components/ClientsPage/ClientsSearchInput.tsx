import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** The client list's name search, in the toolbar or above the list. */
export function ClientsSearchInput({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        placeholder="חפש לקוח..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 border-transparent bg-surface-inset pr-9"
      />
    </div>
  );
}
