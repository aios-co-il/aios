import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Broadcast } from "@/hooks/useBroadcasts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";

type Row = {
  id: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  error: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
};

type Filter = "all" | "opened" | "not_opened" | "clicked" | "failed";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "כולם" },
  { key: "opened", label: "פתחו" },
  { key: "not_opened", label: "לא פתחו" },
  { key: "clicked", label: "הקליקו" },
  { key: "failed", label: "נכשלו" },
];

const STATUS_LABEL: Record<string, string> = {
  pending: "ממתין",
  sent: "נשלח",
  delivered: "נמסר",
  read: "נקרא",
  failed: "נכשל",
  opted_out: "הוסר",
  skipped: "דולג",
};

const pct = (n: number, of: number) =>
  of > 0 ? `${Math.round((n / of) * 100)}%` : "—";
const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("he-IL", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/** Per-broadcast email stats: delivery / open / click rates and who opened. */
export function BroadcastStatsDialog({
  broadcast,
  onClose,
}: {
  broadcast: Broadcast;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const isEmail = broadcast.channel === "email";

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["broadcast-recipients-stats", broadcast.id],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("broadcast_recipients")
        .select(
          "id, contact_name, email, phone, status, error, sent_at, delivered_at, opened_at, clicked_at",
        )
        .eq("broadcast_id", broadcast.id)
        .order("opened_at", { ascending: false, nullsFirst: false })
        .limit(2000);
      if (error) throw error;
      return (data || []) as Row[];
    },
  });

  const total = rows.length;
  const sent = rows.filter((r) => r.sent_at).length;
  const delivered = rows.filter((r) => r.delivered_at).length;
  const opened = rows.filter((r) => r.opened_at).length;
  const clicked = rows.filter((r) => r.clicked_at).length;
  const failed = rows.filter((r) => r.status === "failed").length;
  // Open / click rates are measured against delivered mail (or sent, before
  // any delivery events arrive).
  const base = delivered || sent;

  const tiles = [
    { label: "נמענים", value: total },
    { label: "נשלחו", value: sent, sub: pct(sent, total) },
    ...(isEmail
      ? [
          { label: "נמסרו", value: delivered, sub: pct(delivered, sent) },
          { label: "נפתחו", value: opened, sub: pct(opened, base) },
          { label: "הקליקו", value: clicked, sub: pct(clicked, base) },
        ]
      : []),
    { label: "נכשלו", value: failed, sub: pct(failed, total) },
  ];

  const visible = rows.filter((r) => {
    if (filter === "opened") return !!r.opened_at;
    if (filter === "not_opened") return !r.opened_at && r.status !== "failed";
    if (filter === "clicked") return !!r.clicked_at;
    if (filter === "failed") return r.status === "failed";
    return true;
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>סטטיסטיקות · {broadcast.name}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
              {tiles.map((t) => (
                <div key={t.label} className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">{t.label}</div>
                  <div className="text-xl font-semibold tabular-nums">{t.value}</div>
                  {t.sub && (
                    <div className="text-xs text-muted-foreground tabular-nums">{t.sub}</div>
                  )}
                </div>
              ))}
            </div>
            {isEmail && (
              <p className="text-xs text-muted-foreground">
                שיעור פתיחה והקלקה מחושבים מתוך המיילים שנמסרו. פתיחה נמדדת לפי טעינת תמונות,
                ולכן חלק מתוכנות המייל לא מדווחות עליה.
              </p>
            )}

            {isEmail && (
              <div className="flex flex-wrap gap-1 text-xs">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={`rounded border px-2 py-1 ${filter === f.key ? "bg-primary text-primary-foreground" : ""}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">נמען</TableHead>
                  <TableHead className="text-right">סטטוס</TableHead>
                  <TableHead className="text-right">נשלח</TableHead>
                  {isEmail && <TableHead className="text-right">נפתח</TableHead>}
                  {isEmail && <TableHead className="text-right">הקליק</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                      אין נמענים להצגה
                    </TableCell>
                  </TableRow>
                ) : (
                  visible.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.contact_name || "—"}</div>
                        <div className="text-xs text-muted-foreground" dir="ltr">
                          {isEmail ? r.email : r.phone}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={r.status === "failed" ? "text-destructive" : ""}>
                          {STATUS_LABEL[r.status] || r.status}
                        </span>
                        {r.status === "failed" && r.error && (
                          <div className="max-w-[220px] truncate text-xs text-muted-foreground" title={r.error}>
                            {r.error}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">{fmt(r.sent_at)}</TableCell>
                      {isEmail && <TableCell className="text-xs tabular-nums">{fmt(r.opened_at)}</TableCell>}
                      {isEmail && <TableCell className="text-xs tabular-nums">{fmt(r.clicked_at)}</TableCell>}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
