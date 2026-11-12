import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TeamMemberSelect } from "./TeamMemberSelect";
import { UserActionButtons } from "./UserActionButtons";
import { UserRolesEditor } from "./UserRolesEditor";
import { UserStatusBadge } from "./UserStatusBadge";
import type { UsersListProps } from "./userListTypes";

/*
 * The name column is pinned to the start edge (right, in RTL) so it stays
 * visible while the wide table scrolls sideways. A sticky cell needs an opaque
 * background, or the scrolled columns show through it.
 */
const STICKY_NAME =
  "sticky right-0 z-10 bg-card border-l shadow-[-6px_0_6px_-6px_hsl(var(--foreground)/0.25)]";

/** Desktop users table; the parent supplies the data and handles every action. */
export function UsersTable(props: UsersListProps) {
  const { users, roleLabels, campaigners, salesPeople, actions } = props;

  return (
    <Table className="min-w-[1200px] whitespace-nowrap">
      <TableHeader>
        <TableRow>
          <TableHead className={`text-right ${STICKY_NAME}`}>שם מלא</TableHead>
          <TableHead className="text-right">אימייל</TableHead>
          <TableHead className="text-right">סטטוס</TableHead>
          <TableHead className="text-right">תפקידים</TableHead>
          <TableHead className="text-right">איש צוות</TableHead>
          <TableHead className="text-right">איש מכירות</TableHead>
          <TableHead className="text-right">סוכנויות איש מכירות</TableHead>
          <TableHead className="text-right">פעולות</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell className={STICKY_NAME}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {user.full_name || "-"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => actions.editName(user)}
                  className="h-6 px-2 text-xs"
                >
                  ערוך
                </Button>
              </div>
            </TableCell>
            <TableCell>{user.email}</TableCell>
            <TableCell>
              <UserStatusBadge status={user.status} />
            </TableCell>
            <TableCell>
              <UserRolesEditor
                user={user}
                roleLabels={roleLabels}
                actions={actions}
              />
            </TableCell>
            <TableCell>
              <TeamMemberSelect
                value={user.campaigner_id}
                label={user.campaigner_name}
                options={campaigners}
                onChange={(id) => actions.setCampaigner(user, id)}
                ariaLabel="איש צוות"
                className="w-[140px]"
              />
            </TableCell>
            <TableCell>
              <TeamMemberSelect
                value={user.sales_person_id}
                label={user.sales_person_name}
                options={salesPeople}
                onChange={(id) => actions.setSalesPerson(user, id)}
                ariaLabel="איש מכירות"
                className="w-[140px]"
              />
            </TableCell>
            <TableCell>
              {user.sales_person_id ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => actions.editSalesPersonAgencies(user)}
                  className="h-8 text-sm w-full justify-start"
                >
                  {props.salesPersonAgencyNames(user) || "אין סוכנויות"}
                </Button>
              ) : (
                <span className="text-sm text-muted-foreground">-</span>
              )}
            </TableCell>
            <TableCell>
              <UserActionButtons user={user} compact {...props} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
