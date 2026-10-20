import { useState } from "react";
import {
  useBroadcastLists,
  type BroadcastList,
} from "@/hooks/useBroadcastLists";
import { useLeadStatuses } from "@/hooks/useLeadStatuses";
import {
  CrmListFilterBuilder,
  type CrmListFilter,
} from "@/components/broadcast/CrmListFilterBuilder";
import { ListFileImport } from "@/components/broadcast/ListFileImport";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  RefreshCw,
  Filter,
  Eye,
} from "lucide-react";

const LEAD_SOURCES = [
  { key: "website", label: "אתר" },
  { key: "facebook", label: "פייסבוק" },
  { key: "referral", label: "הפניה" },
  { key: "paid_ads", label: "מודעות" },
  { key: "whatsapp", label: "וואטסאפ" },
  { key: "other", label: "אחר" },
];

export function BroadcastLists() {
  const { lists, deleteList } = useBroadcastLists();
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
                      if (confirm("למחוק את הרשימה?")) deleteList.mutate(l.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" /> {l.member_count} נמענים
                </div>
                <div className="flex flex-wrap gap-1">
                  {l.source === "crm_filter" && (
                    <Badge variant="outline" className="text-xs">
                      <Filter className="ml-1 h-3 w-3" />
                      {l.source_config?.source === "clients"
                        ? "לקוחות"
                        : "לידים"}{" "}
                      לפי סינון
                    </Badge>
                  )}
                  {l.kind === "dynamic" && (
                    <Badge variant="secondary" className="text-xs">
                      <RefreshCw className="ml-1 h-3 w-3" />
                      {l.source === "crm_filter" ? "דינמית" : "מסונכרן"}
                    </Badge>
                  )}
                  {l.source === "google_sheet" && (
                    <Badge variant="outline" className="text-xs">
                      Google Sheet
                    </Badge>
                  )}
                </div>
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
        (openList.source === "crm_filter" && openList.kind === "dynamic" ? (
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
  const {
    useMembers,
    addMembers,
    materialize,
    removeMember,
    sheetHeaders,
    sheetImport,
    useRules,
    addRule,
    deleteRule,
  } = useBroadcastLists();
  const { statuses: leadStatuses } = useLeadStatuses();
  const members = useMembers(list.id);
  const rules = useRules(list.id);

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
  // rule
  const [ruleStatuses, setRuleStatuses] = useState<string[]>([]);
  const [ruleSources, setRuleSources] = useState<string[]>([]);

  const [refreshing, setRefreshing] = useState(false);
  const refreshFromFilter = async () => {
    setRefreshing(true);
    try {
      const res = await materialize({ mode: "freeze", listId: list.id });
      toast.success(`נוספו/עודכנו ${res.added ?? 0} אנשי קשר מהסינון`);
    } catch (e: any) {
      toast.error("הרענון נכשל: " + (e?.message || ""));
    } finally {
      setRefreshing(false);
    }
  };

  const toggle = (arr: string[], v: string, set: (x: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const addManual = async () => {
    if (!m.phone && !m.email) {
      toast.error("צריך טלפון או אימייל");
      return;
    }
    await addMembers.mutateAsync({ listId: list.id, rows: [m], via: "manual" });
    setM({ name: "", phone: "", email: "" });
  };

  const importCsv = async () => {
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
    const n = await addMembers.mutateAsync({
      listId: list.id,
      rows,
      via: "csv",
    });
    setCsv("");
    toast.success(`יובאו ${n} אנשי קשר`);
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

  const runSheetImport = async () => {
    try {
      const res = await sheetImport.mutateAsync({
        listId: list.id,
        sheetId: sheetUrl.trim(),
        fieldMap: map,
        autoSync,
      });
      toast.success(`סונכרנו ${res.total} אנשי קשר מהגיליון`);
      setHeaders(null);
      setSheetUrl("");
    } catch (e: any) {
      toast.error("שגיאת ייבוא: " + (e?.message || ""));
    }
  };

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
            {list.source === "crm_filter" && (
              <div className="flex items-center justify-between rounded-md bg-muted p-2 text-xs">
                <span>
                  רשימה קבועה שנוצרה מסינון CRM. רענון מוסיף את מי שעונה לסינון
                  עכשיו (לא מסיר קיימים).
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
            <div className="max-h-72 overflow-y-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">שם</TableHead>
                    <TableHead className="text-right">טלפון</TableHead>
                    <TableHead className="text-right">אימייל</TableHead>
                    <TableHead className="text-right">שדות</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(members.data || []).map((mem) => (
                    <TableRow key={mem.id}>
                      <TableCell>{mem.name || "—"}</TableCell>
                      <TableCell dir="ltr" className="text-right">
                        {mem.phone || "—"}
                      </TableCell>
                      <TableCell dir="ltr" className="text-right">
                        {mem.email || "—"}
                      </TableCell>
                      <TableCell
                        className="max-w-[160px] truncate text-xs text-muted-foreground"
                        title={Object.entries(mem.custom_fields || {})
                          .map(([k, v]) => `${k}: ${v}`)
                          .join("\n")}
                      >
                        {Object.keys(mem.custom_fields || {}).join(", ") || "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            removeMember.mutate({ id: mem.id, listId: list.id })
                          }
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(members.data || []).length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center text-muted-foreground py-6"
                      >
                        אין חברים ברשימה
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
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
            <p className="rounded-md bg-muted p-2 text-xs">
              להוספה/הסרה כשמשתנה סטטוס או שלב במשפך – צור אוטומציה עם הפעולה
              "הוספה לרשימת דיוור" או "הסרה מרשימת דיוור".
            </p>
            <p className="text-sm text-muted-foreground">
              הוסף אוטומטית לרשימה כל ליד חדש שעונה לתנאים:
            </p>
            <div className="rounded-lg border p-3 space-y-3">
              <div>
                <Label className="mb-1 block text-xs">
                  סטטוס ליד (ריק = כל הסטטוסים)
                </Label>
                <div className="flex flex-wrap gap-2">
                  {(leadStatuses || []).map((s: any) => (
                    <button
                      key={s.status_key}
                      type="button"
                      onClick={() =>
                        toggle(ruleStatuses, s.status_key, setRuleStatuses)
                      }
                      className={`rounded-full border px-2 py-0.5 text-xs ${ruleStatuses.includes(s.status_key) ? "bg-primary text-primary-foreground" : ""}`}
                    >
                      {s.label || s.status_key}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="mb-1 block text-xs">
                  מקור (ריק = כל המקורות)
                </Label>
                <div className="flex flex-wrap gap-2">
                  {LEAD_SOURCES.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => toggle(ruleSources, s.key, setRuleSources)}
                      className={`rounded-full border px-2 py-0.5 text-xs ${ruleSources.includes(s.key) ? "bg-primary text-primary-foreground" : ""}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <Button
                size="sm"
                onClick={async () => {
                  await addRule.mutateAsync({
                    listId: list.id,
                    filter: { statusKeys: ruleStatuses, sources: ruleSources },
                  });
                  setRuleStatuses([]);
                  setRuleSources([]);
                  toast.success("כלל נוסף");
                }}
              >
                <Plus className="ml-1 h-4 w-4" />
                הוסף כלל
              </Button>
            </div>
            <div className="space-y-2">
              {(rules.data || []).map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded border p-2 text-sm"
                >
                  <span>
                    ליד חדש
                    {r.filter?.statusKeys?.length
                      ? ` · סטטוס: ${r.filter.statusKeys.join(", ")}`
                      : ""}
                    {r.filter?.sources?.length
                      ? ` · מקור: ${r.filter.sources.join(", ")}`
                      : " · כל הלידים"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      deleteRule.mutate({ id: r.id, listId: list.id })
                    }
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              {(rules.data || []).length === 0 && (
                <p className="text-xs text-muted-foreground">
                  אין כללים פעילים.
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

const EMPTY_FILTER: CrmListFilter = { source: "leads" };

function NewListDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (l: BroadcastList) => void;
}) {
  const { createList, materialize } = useBroadcastLists();
  const [name, setName] = useState("");
  const [type, setType] = useState<"manual" | "crm">("manual");
  const [kind, setKind] = useState<"dynamic" | "static">("dynamic");
  const [filter, setFilter] = useState<CrmListFilter>(EMPTY_FILTER);
  const [preview, setPreview] = useState<{ total: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const runPreview = async () => {
    setBusy(true);
    try {
      setPreview(await materialize({ mode: "preview", filter }));
    } catch (e: any) {
      toast.error("שגיאה בתצוגה מקדימה: " + (e?.message || ""));
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    setBusy(true);
    try {
      const l = await createList.mutateAsync({
        name: name.trim() || "רשימה חדשה",
        kind: type === "crm" ? kind : "static",
        source: type === "crm" ? "crm_filter" : "manual",
        source_config: type === "crm" ? filter : {},
      });
      if (type === "crm") {
        const res = await materialize({
          mode: kind === "static" ? "freeze" : "preview",
          listId: l.id,
        });
        toast.success(
          kind === "static"
            ? `נוצרה רשימה עם ${res.added ?? 0} אנשי קשר`
            : `רשימה דינמית · ${res.total} תואמים כרגע`,
        );
      }
      onCreated(l);
    } catch (e: any) {
      toast.error("יצירת הרשימה נכשלה: " + (e?.message || ""));
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
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType("manual")}
              className={`rounded-lg border p-3 text-right text-sm ${type === "manual" ? "border-primary bg-primary/5" : ""}`}
            >
              <Upload className="mb-1 h-4 w-4" />
              <div className="font-medium">מקובץ / ידני</div>
              <div className="text-xs text-muted-foreground">
                Excel, CSV, Google Sheets או הוספה ידנית
              </div>
            </button>
            <button
              type="button"
              onClick={() => setType("crm")}
              className={`rounded-lg border p-3 text-right text-sm ${type === "crm" ? "border-primary bg-primary/5" : ""}`}
            >
              <Filter className="mb-1 h-4 w-4" />
              <div className="font-medium">לפי סינון CRM</div>
              <div className="text-xs text-muted-foreground">
                סטטוס, שלב במשפך, סוכנות, קמפיינר
              </div>
            </button>
          </div>

          {type === "crm" && (
            <>
              <CrmListFilterBuilder
                value={filter}
                onChange={(f) => {
                  setFilter(f);
                  setPreview(null);
                }}
              />
              <div className="space-y-2 rounded-lg border p-3">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    checked={kind === "dynamic"}
                    onChange={() => setKind("dynamic")}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">דינמית</span> – מתעדכנת לבד:
                    בכל שליחה נשלח למי שעונה לסינון באותו רגע.
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    checked={kind === "static"}
                    onChange={() => setKind("static")}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">קבועה</span> – צילום מצב
                    עכשיו. אפשר להוסיף/להסיר דרך אוטומציה או ידנית.
                  </span>
                </label>
              </div>
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

function DynamicListDialog({
  list,
  onClose,
}: {
  list: BroadcastList;
  onClose: () => void;
}) {
  const { updateList, materialize } = useBroadcastLists();
  const [filter, setFilter] = useState<CrmListFilter>(
    list.source_config?.source ? list.source_config : EMPTY_FILTER,
  );
  const [preview, setPreview] = useState<Awaited<
    ReturnType<typeof materialize>
  > | null>(null);
  const [busy, setBusy] = useState(false);

  const runPreview = async (save: boolean) => {
    setBusy(true);
    try {
      if (save) {
        await updateList.mutateAsync({ id: list.id, source_config: filter });
        setPreview(await materialize({ mode: "preview", listId: list.id }));
        toast.success("הסינון נשמר");
      } else {
        setPreview(await materialize({ mode: "preview", filter }));
      }
    } catch (e: any) {
      toast.error("שגיאה: " + (e?.message || ""));
    } finally {
      setBusy(false);
    }
  };

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
          <Button
            variant="outline"
            onClick={() => runPreview(false)}
            disabled={busy}
          >
            <Eye className="ml-1 h-4 w-4" /> תצוגה מקדימה
          </Button>
          <Button onClick={() => runPreview(true)} disabled={busy}>
            {busy && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}
            שמור סינון
          </Button>
        </div>
        {preview && (
          <div className="space-y-2">
            <div className="text-sm">
              {preview.total} אנשי קשר · {preview.withPhone} עם טלפון ·{" "}
              {preview.withEmail} עם אימייל
            </div>
            <div className="max-h-64 overflow-y-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">שם</TableHead>
                    <TableHead className="text-right">טלפון</TableHead>
                    <TableHead className="text-right">אימייל</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.sample.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.name || "—"}</TableCell>
                      <TableCell dir="ltr" className="text-right">
                        {r.phone || "—"}
                      </TableCell>
                      <TableCell dir="ltr" className="text-right">
                        {r.email || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
