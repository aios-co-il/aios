import { AutoSendMatrix } from "./AutoSendMatrix";
import { RecentClientSendRefusals } from "./RecentClientSendRefusals";

/**
 * The client card's automatic-send tab (AIO-261): which automatic messages
 * this client may get, and where. With every switch off the client gets none;
 * the send guard (supabase/functions/_shared/client-send/rules.ts) reads these
 * switches, and the refusal list shows what it held back.
 */
export function ClientAutoSendTab({ clientId }: { clientId: string }) {
  return (
    <div className="space-y-4" dir="rtl">
      <p className="text-sm text-muted-foreground">
        כברירת מחדל הלקוח לא מקבל שום הודעה אוטומטית. סמנו מה מותר לשלוח אליו
        אוטומטית ולאן.
      </p>
      <AutoSendMatrix clientId={clientId} />
      <p className="text-xs text-muted-foreground">
        דוחות מתוזמנים נשלחים לפי התזמון בלשונית הדוחות. אוטומציה שהוגדרה ללקוח
        הזה בלבד נשלחת גם בלי הסימון.
      </p>
      <RecentClientSendRefusals clientId={clientId} />
    </div>
  );
}
