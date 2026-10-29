import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Json } from "@/integrations/supabase/types";

export function UnsupportedRecipientRow({
  raw,
  onRemove,
  canRemove,
}: {
  raw: Json;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/20 p-2 flex items-center gap-2">
      <div className="flex-1 min-w-0 text-right space-y-1">
        <p className="text-xs text-muted-foreground">
          יעד בפורמט לא נתמך — נשמר ללא שינוי
        </p>
        <code dir="ltr" className="block truncate text-[11px]">
          {JSON.stringify(raw)}
        </code>
      </div>
      {canRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="h-9 w-9 text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
