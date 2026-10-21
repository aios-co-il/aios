import { useState } from "react";
import { useBroadcastLists } from "@/hooks/useBroadcastLists";
import { errorMessage } from "@/components/broadcast/templateUtils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";

/** Static CRM-filter list: add whoever matches the saved filter right now. */
export function ListRefreshFromFilter({ listId }: { listId: string }) {
  const { materialize } = useBroadcastLists();
  const [refreshing, setRefreshing] = useState(false);
  const refreshFromFilter = async () => {
    setRefreshing(true);
    try {
      const res = await materialize({ mode: "freeze", listId });
      toast.success(`נוספו/עודכנו ${res.added ?? 0} אנשי קשר מהסינון`);
    } catch (e) {
      toast.error("הרענון נכשל: " + errorMessage(e));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="flex items-center justify-between rounded-md bg-muted p-2 text-xs">
      <span>
        רשימה קבועה שנוצרה מסינון CRM. רענון מוסיף את מי שעונה לסינון עכשיו (לא
        מסיר קיימים).
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={refreshFromFilter}
        disabled={refreshing}
      >
        {refreshing ? (
          <Loader2 className="ml-1 h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="ml-1 h-4 w-4" />
        )}
        רענן מהסינון
      </Button>
    </div>
  );
}
