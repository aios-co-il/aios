import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const MAILING_ACTION_OPTIONS = [
  { value: "add_to_mailing_list", label: "הוספה לרשימת דיוור" },
  { value: "remove_from_mailing_list", label: "הסרה מרשימת דיוור" },
  { value: "send_template_to_contact", label: "שליחת טמפלייט לאיש הקשר" },
  { value: "send_template_to_list", label: "שליחת טמפלייט לרשימת דיוור" },
] as const;

export const MAILING_ACTION_LABELS: Record<string, string> = Object.fromEntries(
  MAILING_ACTION_OPTIONS.map((o) => [o.value, o.label]),
);

const HINTS: Record<string, string> = {
  add_to_mailing_list:
    "מכניס את הליד/הלקוח מהטריגר לרשימה קבועה. מתאים לטריגר שינוי סטטוס או שלב במשפך.",
  remove_from_mailing_list: "מוציא את הליד/הלקוח מהטריגר מהרשימה.",
  send_template_to_contact:
    "שולח את הטמפלייט רק לאיש הקשר מהטריגר, דרך מנוע הדיוור (קצב שליחה, הסרה מרשימה, סטטיסטיקה). כל איש קשר מקבל טמפלייט זה פעם אחת לכל אוטומציה.",
  send_template_to_list:
    "יוצר דיוור מלא מהטמפלייט לכל הרשימה. כדי למנוע הצפה – לא נשלח שוב לאותה רשימה לפני שעבר מרווח הזמן.",
};

interface Props {
  tenantId: string;
  actionType: string;
  configuration: Record<string, any>;
  onConfigChange: (key: string, value: any) => void;
}

export default function MailingActionConfig({
  tenantId,
  actionType,
  configuration,
  onConfigChange,
}: Props) {
  const needsList = actionType !== "send_template_to_contact";
  const needsTemplate = actionType.startsWith("send_template");
  const listOnlyStatic =
    actionType === "add_to_mailing_list" ||
    actionType === "remove_from_mailing_list";

  const { data: lists = [] } = useQuery({
    queryKey: ["automation-broadcast-lists", tenantId],
    enabled: !!tenantId && needsList,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("broadcast_lists")
        .select("id, name, kind, member_count")
        .eq("tenant_id", tenantId)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["automation-message-templates", tenantId],
    enabled: !!tenantId && needsTemplate,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("message_templates")
        .select("id, name, channel")
        .eq("tenant_id", tenantId)
        .is("archived_at", null)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: waIntegrations = [] } = useQuery({
    queryKey: ["automation-wa-integrations", tenantId],
    enabled: !!tenantId && needsTemplate,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_integrations")
        .select("id, integration_type, display_name")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .in("integration_type", ["green_api", "manus_wa"]);
      if (error) throw error;
      return data || [];
    },
  });

  const selectedTemplate = templates.find(
    (t) => t.id === configuration?.template_id,
  );
  const visibleLists = listOnlyStatic
    ? lists.filter((l) => l.kind === "static")
    : lists;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 text-right">
        <p className="text-xs text-blue-700">{HINTS[actionType]}</p>
      </div>

      {needsTemplate && (
        <div className="space-y-2">
          <Label className="block text-right">טמפלייט *</Label>
          <Select
            value={configuration?.template_id || ""}
            onValueChange={(v) => onConfigChange("template_id", v)}
          >
            <SelectTrigger className="text-right">
              <SelectValue placeholder="בחר טמפלייט..." />
            </SelectTrigger>
            <SelectContent>
              {templates.length === 0 ? (
                <SelectItem value="__none" disabled>
                  אין טמפלייטים – צור בדיוור → טמפלייטים
                </SelectItem>
              ) : (
                templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} · {t.channel === "email" ? "מייל" : "וואטסאפ"}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      )}

      {needsList && (
        <div className="space-y-2">
          <Label className="block text-right">רשימת דיוור *</Label>
          <Select
            value={configuration?.list_id || ""}
            onValueChange={(v) => onConfigChange("list_id", v)}
          >
            <SelectTrigger className="text-right">
              <SelectValue placeholder="בחר רשימה..." />
            </SelectTrigger>
            <SelectContent>
              {visibleLists.length === 0 ? (
                <SelectItem value="__none" disabled>
                  {listOnlyStatic
                    ? "אין רשימות קבועות – צור בדיוור → רשימות תפוצה"
                    : "אין רשימות – צור בדיוור → רשימות תפוצה"}
                </SelectItem>
              ) : (
                visibleLists.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                    {l.kind === "dynamic" ? " · דינמית" : ""} ({l.member_count})
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {listOnlyStatic && (
            <p className="text-xs text-muted-foreground">
              רשימות דינמיות מתעדכנות לבד לפי הסינון ולכן לא מופיעות כאן.
            </p>
          )}
        </div>
      )}

      {actionType !== "send_template_to_list" && (
        <div className="space-y-2">
          <Label className="block text-right">על מי הפעולה</Label>
          <Select
            value={configuration?.entity || "auto"}
            onValueChange={(v) => onConfigChange("entity", v)}
          >
            <SelectTrigger className="text-right">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">אוטומטי לפי הטריגר</SelectItem>
              <SelectItem value="lead">הליד</SelectItem>
              <SelectItem value="client">הלקוח</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {needsTemplate && selectedTemplate?.channel === "whatsapp" && (
        <div className="space-y-2">
          <Label className="block text-right">חיבור WhatsApp לשליחה</Label>
          <Select
            value={configuration?.integration_id || "auto"}
            onValueChange={(v) =>
              onConfigChange("integration_id", v === "auto" ? null : v)
            }
          >
            <SelectTrigger className="text-right">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">החיבור הפעיל הראשון</SelectItem>
              {waIntegrations.map((i: any) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.display_name ||
                    (i.integration_type === "manus_wa" ? "Manus" : "Green API")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {actionType === "send_template_to_list" && (
        <div className="space-y-2">
          <Label className="block text-right">
            מרווח מינימלי בין שליחות לרשימה (שעות)
          </Label>
          <Input
            type="number"
            min={0}
            value={configuration?.min_interval_hours ?? 24}
            onChange={(e) =>
              onConfigChange("min_interval_hours", Number(e.target.value))
            }
          />
        </div>
      )}
    </div>
  );
}
