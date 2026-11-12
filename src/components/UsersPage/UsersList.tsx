import { Card } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";
import { UserCard } from "./UserCard";
import { UsersTable } from "./UsersTable";
import type { UsersListProps } from "./userListTypes";

/** The organization's users: cards on mobile, a horizontally scrolling table on desktop. */
export function UsersList(props: UsersListProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="space-y-4">
        {props.users.map((user) => (
          <UserCard key={user.id} user={user} {...props} />
        ))}
      </div>
    );
  }

  return (
    <Card className="overflow-hidden">
      <UsersTable {...props} />
    </Card>
  );
}
