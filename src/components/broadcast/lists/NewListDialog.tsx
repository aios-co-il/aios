import { useState } from "react";
import {
  useBroadcastLists,
  type BroadcastList,
} from "@/hooks/useBroadcastLists";
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
  const { createList, materialize, createSyncAutomation } = useBroadcastLists();
  const [name, setName] = useState("");
  const [type, setType] = useState<NewListType>("manual");
  const [kind, setKind] = useState<NewListKind>("synced");
  const [filter, setFilter] = useState<CrmListFilter>(EMPTY_CRM_LIST_FILTER);
  const [preview, setPreview] = useState<{ total: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const runPreview = async () => {
    setBusy(true);
    try {
      setPreview(await materialize({ mode: "preview", filter }));
    } catch (e) {
      toast.error("שגיאה בתצוגה מקדימה: " + errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    setBusy(true);
    try {
      const l = await createList.mutateAsync({
        name: name.trim() || "רשימה חדשה",
        kind: type === "crm" && kind === "dynamic" ? "dynamic" : "static",
        source: type === "crm" ? "crm_filter" : "manual",
        // auto_sync: the database adds / removes members on every change.
        source_config:
          type === "crm" ? { ...filter, auto_sync: kind === "synced" } : {},
      });
      if (type === "crm") {
        const res = await materialize({
          mode: kind === "dynamic" ? "preview" : "freeze",
          listId: l.id,
        });
        // Lead lists also get an editable automation (on/off switch and a
        // place for extra steps on status changes).
        if (kind === "synced" && filter.source === "leads") {
          const automationId = await createSyncAutomation(l);
          l.source_config = {
            ...(l.source_config || {}),
            sync_automation_id: automationId,
          };
        }
        toast.success(
          kind === "dynamic"
            ? `רשימה דינמית · ${res.total} תואמים כרגע`
            : kind === "synced"
              ? `נוצרה רשימה מסונכרנת עם ${res.added ?? 0} אנשי קשר`
              : `נוצרה רשימה עם ${res.added ?? 0} אנשי קשר`,
        );
      }
      onCreated(l);
    } catch (e) {
      toast.error("יצירת הרשימה נכשלה: " + errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

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
            <Button onClick={create} disabled={busy}>
              {busy && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}
              צור רשימה
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
