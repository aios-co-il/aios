import { useState } from "react";
import { useBroadcastLists } from "@/hooks/useBroadcastLists";
import { useLeadStatuses } from "@/hooks/useLeadStatuses";
import { ToggleChip } from "@/components/broadcast/lists/ToggleChip";
import { errorMessage } from "@/components/broadcast/templateUtils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

const LEAD_SOURCES = [
  { key: "website", label: "אתר" },
  { key: "facebook", label: "פייסבוק" },
  { key: "referral", label: "הפניה" },
  { key: "paid_ads", label: "מודעות" },
  { key: "whatsapp", label: "וואטסאפ" },
  { key: "other", label: "אחר" },
];

const toggle = (arr: string[], v: string, set: (x: string[]) => void) =>
  set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

/** Rules that add every new lead matching status/source to the list. */
export function ListRulesSection({ listId }: { listId: string }) {
  const { useRules, addRule, deleteRule } = useBroadcastLists();
  const { statuses: leadStatuses } = useLeadStatuses();
  const rules = useRules(listId);
  const [ruleStatuses, setRuleStatuses] = useState<string[]>([]);
  const [ruleSources, setRuleSources] = useState<string[]>([]);

  const statusLabel = (key: string) =>
    leadStatuses.find((s) => s.status_key === key)?.label || key;

  return (
    <>
      <p className="rounded-md bg-muted p-2 text-xs">
        להוספה/הסרה כשמשתנה סטטוס או שלב במשפך – צור אוטומציה עם הפעולה "הוספה
        לרשימת דיוור" או "הסרה מרשימת דיוור".
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
            {leadStatuses.map((s) => (
              <ToggleChip
                key={s.status_key}
                active={ruleStatuses.includes(s.status_key)}
                onToggle={() =>
                  toggle(ruleStatuses, s.status_key, setRuleStatuses)
                }
              >
                {s.label || s.status_key}
              </ToggleChip>
            ))}
          </div>
        </div>
        <div>
          <Label className="mb-1 block text-xs">מקור (ריק = כל המקורות)</Label>
          <div className="flex flex-wrap gap-2">
            {LEAD_SOURCES.map((s) => (
              <ToggleChip
                key={s.key}
                active={ruleSources.includes(s.key)}
                onToggle={() => toggle(ruleSources, s.key, setRuleSources)}
              >
                {s.label}
              </ToggleChip>
            ))}
          </div>
        </div>
        <Button
          size="sm"
          disabled={addRule.isPending}
          onClick={() =>
            addRule.mutate(
              {
                listId,
                filter: { statusKeys: ruleStatuses, sources: ruleSources },
              },
              {
                onSuccess: () => {
                  setRuleStatuses([]);
                  setRuleSources([]);
                  toast.success("כלל נוסף");
                },
                onError: (e) =>
                  toast.error("הוספת הכלל נכשלה: " + errorMessage(e)),
              },
            )
          }
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
                ? ` · סטטוס: ${r.filter.statusKeys.map(statusLabel).join(", ")}`
                : ""}
              {r.filter?.sources?.length
                ? ` · מקור: ${r.filter.sources.join(", ")}`
                : " · כל הלידים"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => deleteRule.mutate({ id: r.id, listId })}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
        {(rules.data || []).length === 0 && (
          <p className="text-xs text-muted-foreground">אין כללים פעילים.</p>
        )}
      </div>
    </>
  );
}
