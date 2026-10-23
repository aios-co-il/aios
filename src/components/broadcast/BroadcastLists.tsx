import { useState } from "react";
import {
  useBroadcastLists,
  type BroadcastList,
} from "@/hooks/useBroadcastLists";
import { useListSyncAutomation } from "@/hooks/useListSyncAutomation";
import { useUserRole } from "@/hooks/useUserRole";
import { listKind } from "@/lib/broadcastListKind";
import { errorMessage } from "@/components/broadcast/templateUtils";
import { ListFileImport } from "@/components/broadcast/ListFileImport";
import { NewListDialog } from "@/components/broadcast/lists/NewListDialog";
import { DynamicListDialog } from "@/components/broadcast/lists/DynamicListDialog";
import { ListAutomationLink } from "@/components/broadcast/lists/ListAutomationLink";
import { ListRefreshFromFilter } from "@/components/broadcast/lists/ListRefreshFromFilter";
import { ListMembersTable } from "@/components/broadcast/lists/ListMembersTable";
import { ListRulesSection } from "@/components/broadcast/lists/ListRulesSection";
import { ListBadges } from "@/components/broadcast/lists/ListBadges";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Users,
  FileSpreadsheet,
  Upload,
  Zap,
  Loader2,
} from "lucide-react";

export function BroadcastLists() {
  const { lists, deleteList } = useBroadcastLists();
  const { deleteSyncAutomation } = useListSyncAutomation();
  const { isOwner } = useUserRole();
  const removeList = (l: BroadcastList) => {
    const syncId: string | undefined = l.source_config?.sync_automation_id;
    // Only owners may delete automations (RLS); the list delete alone is fine.
    if (!syncId || !isOwner) return deleteList.mutate(l.id);
    // The list's own sync automation would only fail once the list is gone.
    deleteSyncAutomation.mutate(syncId, {
      onSettled: () => deleteList.mutate(l.id),
    });
  };
  const [openList, setOpenList] = useState<BroadcastList | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <Button onClick={() => setCreating(true)}>
          <Plus className="ml-1 h-4 w-4" /> רשימה חדשה
        </Button>
      </div>

      {lists.isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (lists.data || []).length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <Users className="mx-auto mb-2 h-8 w-8 opacity-50" /> אין רשימות
          עדיין.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(lists.data || []).map((l) => (
            <Card
              key={l.id}
              className="cursor-pointer hover:border-primary"
              onClick={() => setOpenList(l)}
            >
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div className="font-medium">{l.name}</div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("למחוק את הרשימה?")) removeList(l);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" /> {l.member_count} נמענים
                </div>
                <ListBadges list={l} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {creating && (
        <NewListDialog
          onClose={() => setCreating(false)}
          onCreated={(l) => {
            setCreating(false);
            setOpenList(l);
          }}
        />
      )}

      {openList &&
        (openList.source === "crm_filter" &&
        listKind(openList) === "dynamic" ? (
          <DynamicListDialog
            list={openList}
            onClose={() => setOpenList(null)}
          />
        ) : (
          <ListDetailDialog list={openList} onClose={() => setOpenList(null)} />
        ))}
    </div>
  );
}

function ListDetailDialog({
  list,
  onClose,
}: {
  list: BroadcastList;
  onClose: () => void;
}) {
  const { useMembers, addMembers, removeMember, sheetHeaders, sheetImport } =
    useBroadcastLists();
  const members = useMembers(list.id);
  const syncAutomationId: string | undefined =
    list.source_config?.sync_automation_id;

  // manual add
  const [m, setM] = useState({ name: "", phone: "", email: "" });
  // csv paste
  const [csv, setCsv] = useState("");
  // sheet
  const [sheetUrl, setSheetUrl] = useState("");
  const [headers, setHeaders] = useState<string[] | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [autoSync, setAutoSync] = useState(false);
  const [loadingHeaders, setLoadingHeaders] = useState(false);
  const onAddError = (e: unknown) =>
    toast.error("ההוספה נכשלה: " + errorMessage(e));

  const addManual = () => {
    if (!m.phone && !m.email) {
      toast.error("צריך טלפון או אימייל");
      return;
    }
    addMembers.mutate(
      { listId: list.id, rows: [m], via: "manual" },
      {
        onSuccess: () => setM({ name: "", phone: "", email: "" }),
        onError: onAddError,
      },
    );
  };

  const importCsv = () => {
    const rows = csv
      .split("\n")
      .map((line) => {
        const [name, phone, email] = line.split(",").map((c) => c?.trim());
        return { name, phone, email };
      })
      .filter((r) => r.phone || r.email);
    if (!rows.length) {
      toast.error("לא נמצאו שורות תקינות");
      return;
    }
    addMembers.mutate(
      { listId: list.id, rows, via: "csv" },
      {
        onSuccess: (n) => {
          setCsv("");
          toast.success(`יובאו ${n} אנשי קשר`);
        },
        onError: onAddError,
      },
    );
  };

  const loadHeaders = async () => {
    if (!sheetUrl.trim()) return;
    setLoadingHeaders(true);
    try {
      const res = await sheetHeaders(sheetUrl.trim());
      setHeaders(res.headers);
      setMap(res.suggestedMap || {});
    } catch (e: any) {
      toast.error(
        "שגיאה בטעינת הגיליון: " + (e?.message || "ודא שהגיליון משותף לצפייה"),
      );
    } finally {
      setLoadingHeaders(false);
    }
  };

  const runSheetImport = () =>
    sheetImport.mutate(
      { listId: list.id, sheetId: sheetUrl.trim(), fieldMap: map, autoSync },
      {
        onSuccess: (res) => {
          toast.success(`סונכרנו ${res.total} אנשי קשר מהגיליון`);
          setHeaders(null);
          setSheetUrl("");
        },
        onError: (e) => toast.error("שגיאת ייבוא: " + errorMessage(e)),
      },
    );

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle>{list.name}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="members">
          <TabsList className="w-full">
            <TabsTrigger value="members" className="flex-1">
              <Users className="ml-1 h-4 w-4" />
              חברים
            </TabsTrigger>
            <TabsTrigger value="import" className="flex-1">
              <Upload className="ml-1 h-4 w-4" />
              ייבוא
            </TabsTrigger>
            <TabsTrigger value="rules" className="flex-1">
              <Zap className="ml-1 h-4 w-4" />
              אוטומציה
            </TabsTrigger>
          </TabsList>

          {/* MEMBERS */}
          <TabsContent value="members" className="space-y-3">
            {syncAutomationId && (
              <ListAutomationLink automationId={syncAutomationId} />
            )}
            {list.source === "crm_filter" && (
              <ListRefreshFromFilter listId={list.id} />
            )}
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="שם"
                value={m.name}
                onChange={(e) => setM({ ...m, name: e.target.value })}
                className="w-28"
              />
              <Input
                placeholder="טלפון"
                value={m.phone}
                onChange={(e) => setM({ ...m, phone: e.target.value })}
                className="w-32"
              />
              <Input
                placeholder="אימייל"
                value={m.email}
                onChange={(e) => setM({ ...m, email: e.target.value })}
                className="w-40"
              />
              <Button onClick={addManual} disabled={addMembers.isPending}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <ListMembersTable
              members={members.data || []}
              onRemove={(id) => removeMember.mutate({ id, listId: list.id })}
            />
          </TabsContent>

          {/* IMPORT */}
          <TabsContent value="import" className="space-y-5">
            <ListFileImport listId={list.id} />
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Upload className="h-4 w-4" />
                הדבקת רשימה (CSV)
              </Label>
              <p className="text-xs text-muted-foreground">
                שורה לכל איש קשר: <code>שם, טלפון, אימייל</code>
              </p>
              <Textarea
                rows={4}
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
                placeholder="ישראל ישראלי, 0501234567, israel@mail.com"
                dir="ltr"
              />
              <Button
                onClick={importCsv}
                disabled={addMembers.isPending}
                variant="secondary"
              >
                ייבא מהטקסט
              </Button>
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <Label className="flex items-center gap-1">
                <FileSpreadsheet className="h-4 w-4" />
                ייבוא מ-Google Sheets
              </Label>
              <p className="text-xs text-muted-foreground">
                הדבק קישור לגיליון (משותף לצפייה לכל מי שיש לו קישור).
              </p>
              <div className="flex gap-2">
                <Input
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  dir="ltr"
                  className="flex-1"
                />
                <Button
                  onClick={loadHeaders}
                  disabled={loadingHeaders}
                  variant="secondary"
                >
                  {loadingHeaders ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "טען עמודות"
                  )}
                </Button>
              </div>
              {headers && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">מיפוי עמודות:</p>
                  {headers.map((h) => (
                    <div key={h} className="flex items-center gap-2 text-sm">
                      <span className="w-40 truncate">{h}</span>
                      <Select
                        value={map[h] || "ignore"}
                        onValueChange={(v) =>
                          setMap({ ...map, [h]: v === "ignore" ? "" : v })
                        }
                      >
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-background z-[100]">
                          <SelectItem value="ignore">— התעלם —</SelectItem>
                          <SelectItem value="name">שם</SelectItem>
                          <SelectItem value="phone">טלפון</SelectItem>
                          <SelectItem value="email">אימייל</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={autoSync} onCheckedChange={setAutoSync} />{" "}
                    סנכרון אוטומטי (הגיליון = מקור אמת)
                  </label>
                  <Button
                    onClick={runSheetImport}
                    disabled={sheetImport.isPending}
                  >
                    {sheetImport.isPending ? (
                      <Loader2 className="ml-1 h-4 w-4 animate-spin" />
                    ) : null}{" "}
                    ייבא מהגיליון
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          {/* RULES */}
          <TabsContent value="rules" className="space-y-4">
            <ListRulesSection listId={list.id} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
