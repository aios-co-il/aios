import { Switch } from "@/components/ui/switch";

/**
 * The manager's switch for one member's pictures of sensitive pages (AIO-656): mail,
 * messaging, banks, payments and pages with a password or payment field. Off by default and
 * for a member without a permissions row; the server reads it for the signed-in user only.
 */
export function SensitiveScreenshotsSwitch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-md border p-2 text-xs">
      <span className="space-y-0.5">
        <span className="block font-medium">צילום דפים רגישים</span>
        <span className="block text-[11px] text-muted-foreground">
          כרמן תוכל לצלם דפי דואר, הודעות, בנק ותשלומים ודפים עם שדה סיסמה או
          תשלום, ותבקש אישור לפני כל צילום. התמונה נשלחת למודל ה-AI. לחיצה
          והקלדה בדפים האלה נשארות חסומות.
        </span>
      </span>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-label="צילום דפים רגישים"
      />
    </label>
  );
}
