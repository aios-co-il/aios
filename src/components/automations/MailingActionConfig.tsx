import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useMailingActionOptions } from "@/components/automations/useMailingActionOptions";
import {
  MailingEntitySelect,
  MailingListSelect,
  MailingTemplateSelect,
  MailingWhatsAppSelect,
} from "@/components/automations/MailingActionSelects";

export const MAILING_ACTION_OPTIONS = [
  { value: "add_to_mailing_list", label: "הוספה לרשימת דיוור" },
  { value: "remove_from_mailing_list", label: "הסרה מרשימת דיוור" },
  { value: "send_template_to_contact", label: "שליחת טמפלייט לאיש הקשר" },
  { value: "send_template_to_list", label: "שליחת טמפלייט לרשימת דיוור" },
  { value: "sync_mailing_list", label: "סנכרון לרשימת דיוור לפי הסינון" },
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
  sync_mailing_list:
    "בודק אם הליד/הלקוח מהטריגר עונה עכשיו לסינון של הרשימה: אם כן – נכנס לרשימה, אם לא – יוצא ממנה. עבור רשימות שנוצרו מסינון CRM.",
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
    actionType === "remove_from_mailing_list" ||
    actionType === "sync_mailing_list";

  const { lists, templates, waIntegrations } = useMailingActionOptions(
    tenantId,
    { needsList, needsTemplate },
  );

  const selectedTemplate = templates.find(
    (t) => t.id === configuration?.template_id,
  );
  const visibleLists = lists.filter(
    (l) =>
      (!listOnlyStatic || l.kind === "static") &&
      (actionType !== "sync_mailing_list" || l.source === "crm_filter"),
  );

  return (
    <div className="space-y-4" dir="rtl">
      <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 text-right">
        <p className="text-xs text-blue-700">{HINTS[actionType]}</p>
      </div>

      {needsTemplate && (
        <MailingTemplateSelect
          templates={templates}
          value={configuration?.template_id || ""}
          onChange={(v) => onConfigChange("template_id", v)}
        />
      )}

      {needsList && (
        <MailingListSelect
          lists={visibleLists}
          listOnlyStatic={listOnlyStatic}
          value={configuration?.list_id || ""}
          onChange={(v) => onConfigChange("list_id", v)}
        />
      )}

      {actionType !== "send_template_to_list" &&
        actionType !== "sync_mailing_list" && (
          <MailingEntitySelect
            value={configuration?.entity || "auto"}
            onChange={(v) => onConfigChange("entity", v)}
          />
        )}

      {needsTemplate && selectedTemplate?.channel === "whatsapp" && (
        <MailingWhatsAppSelect
          integrations={waIntegrations}
          value={configuration?.integration_id || "auto"}
          onChange={(v) =>
            onConfigChange("integration_id", v === "auto" ? null : v)
          }
        />
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
