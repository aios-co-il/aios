import { UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatMemberName } from "@/lib/memberName";
import { useInactiveMembers } from "./useInactiveMembers";
import { useMemberActivation } from "./useMemberActivation";

/** The current organization's inactive members, each with a reactivate button; nothing when there are none. */
export function InactiveMembersCard() {
  const { data: members = [], error } = useInactiveMembers();
  const activation = useMemberActivation();

  if (error) {
    return (
      <Card className="p-4 mt-4 text-sm text-destructive">
        שגיאה בטעינת המשתמשים המושבתים: {error.message}
      </Card>
    );
  }
  if (members.length === 0) {
    return null;
  }

  return (
    <Card className="p-4 mt-4" dir="rtl">
      <h3 className="font-semibold mb-3">משתמשים מושבתים</h3>
      <div className="space-y-2">
        {members.map((member) => (
          <div
            key={member.user_id}
            className="flex items-center justify-between gap-2"
          >
            <div className="min-w-0">
              <div className="font-medium truncate">
                {formatMemberName(member.profiles)}
              </div>
              {member.profiles?.email && (
                <div className="text-sm text-muted-foreground truncate">
                  {member.profiles.email}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="outline">לא פעיל</Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  activation.mutate({ userId: member.user_id, active: true })
                }
                disabled={activation.isPending}
              >
                <UserCheck className="h-3 w-3 ml-1" />
                הפעל מחדש
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
