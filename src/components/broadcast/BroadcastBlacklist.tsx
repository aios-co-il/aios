import { useState } from "react";
import { Ban, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  useBroadcastBlacklist,
  type BlacklistEntry,
} from "@/hooks/useBroadcastBlacklist";

const SOURCE_LABELS: Record<string, string> = {
  unsubscribe_link: "קישור הסרה",
  email_unsubscribe: "קישור הסרה (מייל)",
  manual: "ידני",
};

const CHANNEL_LABELS: Record<string, string> = {
  all: "כל הדיוורים",
  whatsapp: "וואטסאפ",
  email: "מייל",
};

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : String(e);

/** Mailing blacklist: who is blocked from mailings, add and unblock. */
export function BroadcastBlacklist() {
  const { list, add, remove } = useBroadcastBlacklist();
  const [address, setAddress] = useState("");

  const submit = () => {
    const value = address.trim();
    if (!value) return;
    add.mutate(value.includes("@") ? { email: value } : { phone: value }, {
      onSuccess: (n) => {
        if (n === 0) return toast.error("טלפון או אימייל לא תקין");
        setAddress("");
        toast.success("נוסף לרשימה השחורה");
      },
      onError: (e) => toast.error("שגיאה: " + errorMessage(e)),
    });
  };

  const unblock = (entry: BlacklistEntry) =>
    remove.mutate(entry.id, {
      onSuccess: () => toast.success("הוסר מהרשימה השחורה"),
      onError: (e) => toast.error("שגיאה: " + errorMessage(e)),
    });

  const rows = list.data ?? [];

  return (
    <div className="space-y-4" dir="rtl">
      <p className="text-sm text-muted-foreground">
        מי שלחץ על קישור ההסרה בדיוור, או שנוסף כאן ידנית, לא יקבל דיוורים – לא
        בוואטסאפ ולא במייל. שיחות והודעות ידניות לא נחסמות.
      </p>
      <div className="flex max-w-md gap-2">
        <Input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="טלפון או אימייל"
          dir="ltr"
        />
        <Button onClick={submit} disabled={add.isPending || !address.trim()}>
          <Plus className="ml-1 h-4 w-4" /> חסימה
        </Button>
      </div>

      {list.isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <Ban className="mx-auto mb-2 h-8 w-8 opacity-50" />
          הרשימה השחורה ריקה.
        </div>
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2">
                <span className="min-w-0 flex-1 truncate" dir="ltr">
                  {r.phone || r.email}
                </span>
                <Badge variant="secondary">
                  {CHANNEL_LABELS[r.channel] ?? r.channel}
                </Badge>
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {SOURCE_LABELS[r.source ?? ""] ?? r.source ?? ""} ·{" "}
                  {new Date(r.created_at).toLocaleDateString("he-IL")}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  title="הסר חסימה"
                  disabled={remove.isPending}
                  onClick={() => unblock(r)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
