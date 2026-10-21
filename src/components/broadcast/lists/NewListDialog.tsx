import { useState } from "react";
import type { BroadcastList } from "@/hooks/useBroadcastLists";
import { useMaterializeList } from "@/hooks/useMaterializeList";
import { useCreateMailingList } from "@/components/broadcast/lists/useCreateMailingList";
import {
  CrmListFilterBuilder,
  type CrmListFilter,
} from "@/components/broadcast/CrmListFilterBuilder";
import { EMPTY_CRM_LIST_FILTER } from "@/components/broadcast/useCrmFilterOptions";
import { errorMessage } from "@/components/broadcast/templateUtils";
import {
  NewListKindOptions,
  NewListTypePicker,
  type NewListKind,
  type NewListType,
} from "@/components/broadcast/lists/NewListOptions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Eye, Loader2 } from "lucide-react";

/** Create a mailing list: manual/file, or from a CRM filter (synced, dynamic or static). */
export function NewListDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (l: BroadcastList) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<NewListType>("manual");
  const [kind, setKind] = useState<NewListKind>("synced");
  const [filter, setFilter] = useState<CrmListFilter>(EMPTY_CRM_LIST_FILTER);
  const [preview, setPreview] = useState<{ total: number } | null>(null);
  const materialize = useMaterializeList();
  const { create, isPending: creating } = useCreateMailingList(onCreated);
  const busy = materialize.isPending || creating;

  const runPreview = () =>
    materialize.mutate(
      { mode: "preview", filter },
      {
        onSuccess: setPreview,
        onError: (e) => toast.error("שגיאה בתצוגה מקדימה: " + errorMessage(e)),
      },
    );

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-h-[90vh] max-w-lg overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle>רשימת דיוור חדשה</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>שם</Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="למשל: לידים בשלב פגישה"
            />
          </div>
          <NewListTypePicker value={type} onChange={setType} />

          {type === "crm" && (
            <>
              <CrmListFilterBuilder
                value={filter}
                onChange={(f) => {
                  setFilter(f);
                  setPreview(null);
                }}
              />
              <NewListKindOptions
                value={kind}
                onChange={setKind}
                leads={filter.source === "leads"}
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={runPreview}
                  disabled={busy}
                >
                  <Eye className="ml-1 h-4 w-4" /> כמה עונים לסינון?
                </Button>
                {preview && (
                  <span className="text-sm">{preview.total} אנשי קשר</span>
                )}
              </div>
            </>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              ביטול
            </Button>
            <Button
              onClick={() => create({ name, type, kind, filter })}
              disabled={busy}
            >
              {busy && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}
              צור רשימה
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
