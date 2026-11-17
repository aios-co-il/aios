import { useSearchParams } from "react-router-dom";
import { RECIPIENT_ID } from "../../supabase/functions/broadcast-unsubscribe/contract.ts";
import { UnsubscribeCard } from "@/components/UnsubscribePage/UnsubscribeCard";
import { UnsubscribePanel } from "@/components/UnsubscribePage/UnsubscribePanel";
import { useNoIndex } from "@/components/UnsubscribePage/useNoIndex";

/**
 * Public page behind the unsubscribe link of every mailing
 * (/unsubscribe/:tenantSlug?r=<recipient_id>). No sign-in and no tenant
 * context: the recipient id is the only credential, and the server scopes
 * the unsubscribe to that recipient's organization.
 */
export default function Unsubscribe() {
  useNoIndex();
  const [searchParams] = useSearchParams();
  const recipientId = searchParams.get("r")?.trim() ?? "";

  if (!RECIPIENT_ID.test(recipientId)) {
    return (
      <UnsubscribeCard title="קישור לא תקין">
        <p className="text-muted-foreground">
          הקישור להסרה אינו תקין. נסו לפתוח שוב את הקישור מתוך ההודעה שקיבלתם.
        </p>
      </UnsubscribeCard>
    );
  }
  return <UnsubscribePanel recipientId={recipientId} />;
}
