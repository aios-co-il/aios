import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UnsubscribeCard } from "./UnsubscribeCard";
import {
  UnsubscribeError,
  useUnsubscribe,
  useUnsubscribeTenantName,
} from "./useUnsubscribe";

/** Confirm → unsubscribing → done, or an error with a retry. */
export function UnsubscribePanel({ recipientId }: { recipientId: string }) {
  const { data: tenantName } = useUnsubscribeTenantName(recipientId);
  const unsubscribe = useUnsubscribe(recipientId);
  const organization = unsubscribe.data ?? tenantName ?? null;

  if (unsubscribe.isSuccess) {
    return (
      <UnsubscribeCard title="הוסרת בהצלחה ✓" subtitle={organization}>
        <p className="text-muted-foreground">לא יישלחו אליך עוד דיוורים.</p>
      </UnsubscribeCard>
    );
  }

  if (
    unsubscribe.error instanceof UnsubscribeError &&
    unsubscribe.error.failure === "not_found"
  ) {
    return (
      <UnsubscribeCard title="הקישור פג או לא נמצא" subtitle={organization}>
        <p className="text-muted-foreground">
          לא מצאנו את הדיוור שהקישור שייך אליו. אפשר לפנות לשולח ההודעה ולבקש
          להסיר אותך.
        </p>
      </UnsubscribeCard>
    );
  }

  return (
    <UnsubscribeCard title="הסרה מרשימת הדיוור" subtitle={organization}>
      <p className="text-muted-foreground">
        {organization
          ? `לאחר ההסרה לא יישלחו אליך עוד דיוורים מ${organization}, לא בוואטסאפ ולא באימייל.`
          : "לאחר ההסרה לא יישלחו אליך עוד דיוורים, לא בוואטסאפ ולא באימייל."}
      </p>
      {unsubscribe.isError && (
        <p role="alert" className="text-sm text-destructive">
          אירעה שגיאה וההסרה לא הושלמה. נסו שוב.
        </p>
      )}
      <Button
        variant="destructive"
        size="lg"
        className="w-full"
        disabled={unsubscribe.isPending}
        onClick={() => unsubscribe.mutate()}
      >
        {unsubscribe.isPending && <Loader2 className="animate-spin" />}
        {unsubscribe.isError ? "נסו שוב" : "הסירו אותי"}
      </Button>
    </UnsubscribeCard>
  );
}
