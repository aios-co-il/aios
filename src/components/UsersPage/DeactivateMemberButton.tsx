import { UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMemberActivation } from "./useMemberActivation";

/** Deactivates one member of the current organization after a confirm; never shown for the signed-in user. */
export function DeactivateMemberButton({
  user,
  currentUserId,
  compact = false,
}: {
  user: { id: string; email: string; full_name: string | null };
  currentUserId: string | null | undefined;
  compact?: boolean;
}) {
  const activation = useMemberActivation();
  if (user.id === currentUserId) {
    return null;
  }

  const deactivate = () => {
    const name = user.full_name || user.email;
    if (
      confirm(
        `להשבית את ${name}? הוא לא יופיע ברשימות ובשיוכים, והעדכונים שכתב יישארו בהיסטוריה.`,
      )
    ) {
      activation.mutate({ userId: user.id, active: false });
    }
  };

  return (
    <Button
      variant="outline"
      size={compact ? "icon" : "sm"}
      onClick={deactivate}
      disabled={activation.isPending}
      title="השבת משתמש"
      className={compact ? "flex-shrink-0" : "flex-1"}
    >
      <UserX className={compact ? "h-4 w-4" : "h-3 w-3 ml-1"} />
      {!compact && "השבת"}
    </Button>
  );
}
