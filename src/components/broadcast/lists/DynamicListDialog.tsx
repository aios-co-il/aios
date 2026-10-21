import { useState } from "react";
import {
  useBroadcastLists,
  type BroadcastList,
  type ListPreview,
} from "@/hooks/useBroadcastLists";
import { useMaterializeList } from "@/hooks/useMaterializeList";
import {
  CrmListFilterBuilder,
  type CrmListFilter,
} from "@/components/broadcast/CrmListFilterBuilder";
import { EMPTY_CRM_LIST_FILTER } from "@/components/broadcast/useCrmFilterOptions";
import { errorMessage } from "@/components/broadcast/templateUtils";
import { ListPreviewTable } from "@/components/broadcast/lists/ListPreviewTable";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Eye, Loader2 } from "lucide-react";

/** A dynamic CRM-filter list: edit its filter and preview who matches now. */
export function DynamicListDialog({
  list,
  onClose,
}: {
  list: BroadcastList;
  onClose: () => void;
}) {
  const { updateList } = useBroadcastLists();
  const materialize = useMaterializeList();
  const [filter, setFilter] = useState<CrmListFilter>(
    list.source_config?.source ? list.source_config : EMPTY_CRM_LIST_FILTER,
  );
  const [preview, setPreview] = useState<ListPreview | null>(null);
  const busy = updateList.isPending || materialize.isPending;
  const onError = (e: unknown) => toast.error("שגיאה: " + errorMessage(e));

  const runPreview = () =>
    materialize.mutate(
      { mode: "preview", filter },
      { onSuccess: setPreview, onError },
    );

  const saveFilter = () =>
    updateList.mutate(
      { id: list.id, source_config: filter },
      {
        onSuccess: () =>
          materialize.mutate(
            { mode: "preview", listId: list.id },
            {
              onSuccess: (p) => {
                setPreview(p);
                toast.success("הסינון נשמר");
              },
              onError,
            },
          ),
        onError,
      },
    );

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-h-[90vh] max-w-2xl overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle>{list.name} · רשימה דינמית</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          הרשימה מחושבת מחדש בכל שליחה. מי שעובר לשלב/סטטוס שעונה לסינון נכנס
          אליה אוטומטית, ומי שיוצא ממנו – יוצא.
        </p>
        <CrmListFilterBuilder
          value={filter}
          onChange={(f) => {
            setFilter(f);
            setPreview(null);
          }}
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={runPreview} disabled={busy}>
            <Eye className="ml-1 h-4 w-4" /> תצוגה מקדימה
          </Button>
          <Button onClick={saveFilter} disabled={busy}>
            {busy && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}
            שמור סינון
          </Button>
        </div>
        {preview && <ListPreviewTable preview={preview} />}
      </DialogContent>
    </Dialog>
  );
}
