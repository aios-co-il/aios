import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** "Manual" audience: typed emails or phones, without picking a CRM record. */
export function WizardManualAudience({
  channel,
  value,
  onChange,
}: {
  channel: "whatsapp" | "email";
  value: string;
  onChange: (text: string) => void;
}) {
  const isEmail = channel === "email";
  return (
    <div className="space-y-1">
      <Label>{isEmail ? "כתובות מייל" : "מספרי טלפון"}</Label>
      <Textarea
        dir="ltr"
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          isEmail ? "name@example.com, other@example.com" : "0501234567"
        }
      />
      <p className="text-xs text-muted-foreground">
        כתובת אחת או יותר, מופרדות בפסיק או בשורה חדשה — בלי לבחור ליד, לקוח או
        צוות.
      </p>
    </div>
  );
}
