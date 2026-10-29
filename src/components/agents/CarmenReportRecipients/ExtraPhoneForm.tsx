import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toReportPhoneE164 } from "./reportPhone";

/** Adds a phone that is not a team member's (for example a partner), with a label. */
export function ExtraPhoneForm({
  adding,
  onAdd,
}: {
  adding: boolean;
  onAdd: (
    input: { phone: string; label: string },
    options: { onSuccess: () => void },
  ) => void;
}) {
  const [label, setLabel] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const e164 = toReportPhoneE164(phone);
    if (!label.trim()) {
      setError("צריך שם למספר");
      return;
    }
    if (!e164) {
      setError("מספר WhatsApp לא תקין");
      return;
    }
    setError(null);
    onAdd(
      { phone: e164, label: label.trim() },
      {
        onSuccess: () => {
          setLabel("");
          setPhone("");
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-1">
      <div className="flex gap-2">
        <Input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="שם (למשל: דוד)"
          aria-label="שם למספר הנוסף"
          maxLength={80}
          className="h-8 text-xs"
        />
        <Input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="9725XXXXXXXX"
          aria-label="מספר WhatsApp נוסף"
          dir="ltr"
          className="h-8 text-xs"
        />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 text-xs"
          disabled={adding}
        >
          הוסף מספר
        </Button>
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </form>
  );
}
