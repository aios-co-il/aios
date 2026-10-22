import { Button } from "@/components/ui/button";
import { Sparkles, Plus } from "lucide-react";

export function SkinsHeader({
  embedded,
  onNew,
}: {
  embedded: boolean;
  onNew: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Button onClick={onNew} className="gap-1.5 shrink-0">
        <Plus className="h-4 w-4" />
        סקין חדש
      </Button>
      {embedded ? (
        <p className="text-sm text-muted-foreground text-right">
          תפקידים שהסוכן לובש לפי המשימה — קופי, SEO, קמפיינר, כספים ועוד.
        </p>
      ) : (
        <div className="text-right">
          <h1 className="text-2xl font-bold flex items-center gap-2 justify-end">
            <Sparkles className="h-6 w-6 text-orange-500" />
            סקינז
          </h1>
          <p className="text-sm text-muted-foreground">
            תפקידים שהסוכן לובש לפי המשימה — קופי, SEO, קמפיינר, כספים ועוד.
          </p>
        </div>
      )}
    </div>
  );
}
