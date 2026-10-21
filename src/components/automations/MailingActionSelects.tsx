import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MailingOptions } from "@/components/automations/useMailingActionOptions";

function Field({
  label,
  value,
  onChange,
  placeholder,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className="block text-right">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="text-right">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}

export function MailingTemplateSelect({
  templates,
  value,
  onChange,
}: {
  templates: MailingOptions["templates"];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field
      label="טמפלייט *"
      value={value}
      onChange={onChange}
      placeholder="בחר טמפלייט..."
    >
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
    </Field>
  );
}

export function MailingListSelect({
  lists,
  listOnlyStatic,
  value,
  onChange,
}: {
  lists: MailingOptions["lists"];
  listOnlyStatic: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Field
        label="רשימת דיוור *"
        value={value}
        onChange={onChange}
        placeholder="בחר רשימה..."
      >
        {lists.length === 0 ? (
          <SelectItem value="__none" disabled>
            {listOnlyStatic
              ? "אין רשימות קבועות – צור בדיוור → רשימות תפוצה"
              : "אין רשימות – צור בדיוור → רשימות תפוצה"}
          </SelectItem>
        ) : (
          lists.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.name}
              {l.kind === "dynamic" ? " · דינמית" : ""} ({l.member_count})
            </SelectItem>
          ))
        )}
      </Field>
      {listOnlyStatic && (
        <p className="text-xs text-muted-foreground">
          רשימות דינמיות מתעדכנות לבד לפי הסינון ולכן לא מופיעות כאן.
        </p>
      )}
    </div>
  );
}

export function MailingEntitySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label="על מי הפעולה" value={value} onChange={onChange}>
      <SelectItem value="auto">אוטומטי לפי הטריגר</SelectItem>
      <SelectItem value="lead">הליד</SelectItem>
      <SelectItem value="client">הלקוח</SelectItem>
    </Field>
  );
}

export function MailingWhatsAppSelect({
  integrations,
  value,
  onChange,
}: {
  integrations: MailingOptions["waIntegrations"];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label="חיבור WhatsApp לשליחה" value={value} onChange={onChange}>
      <SelectItem value="auto">החיבור הפעיל הראשון</SelectItem>
      {integrations.map((i) => (
        <SelectItem key={i.id} value={i.id}>
          {i.display_name ||
            (i.integration_type === "manus_wa" ? "Manus" : "Green API")}
        </SelectItem>
      ))}
    </Field>
  );
}
