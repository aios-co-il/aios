import type { MessageTemplate } from "@/hooks/useMessageTemplates";
import type { EmailAttachment } from "../../../../supabase/functions/_shared/broadcast/template/email-attachments.ts";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Optional template choice for the wizard's content step ("none" = free text). */
export function WizardTemplatePicker({
  templates,
  templateId,
  onSelect,
}: {
  templates: MessageTemplate[];
  templateId: string | null;
  onSelect: (template: MessageTemplate | null) => void;
}) {
  if (templates.length === 0) return null;
  return (
    <div className="space-y-1">
      <Label>טמפלייט (אופציונלי)</Label>
      <Select
        value={templateId ?? "none"}
        onValueChange={(v) => {
          if (v === "none") onSelect(null);
          else {
            const t = templates.find((x) => x.id === v);
            if (t) onSelect(t);
          }
        }}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-background z-[100]">
          <SelectItem value="none">ללא – כתיבה חופשית</SelectItem>
          {templates.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Names of the attachments the chosen email template carries. */
export function WizardTemplateAttachments({
  attachments,
}: {
  attachments: EmailAttachment[];
}) {
  if (attachments.length === 0) return null;
  return (
    <p className="text-xs text-muted-foreground">
      קבצים מצורפים מהטמפלייט: {attachments.map((a) => a.name).join(", ")}
    </p>
  );
}
