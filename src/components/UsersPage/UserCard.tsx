import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TeamMemberSelect } from "./TeamMemberSelect";
import { UserActionButtons } from "./UserActionButtons";
import { UserRolesEditor } from "./UserRolesEditor";
import { UserStatusBadge } from "./UserStatusBadge";
import type { ManagedUser, UsersListProps } from "./userListTypes";

/** Mobile card for one user, with the same fields and actions as a table row. */
export function UserCard({
  user,
  ...props
}: UsersListProps & { user: ManagedUser }) {
  const { roleLabels, campaigners, salesPeople, actions } = props;

  return (
    <Card className="p-4">
      <div className="space-y-3">
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0">
            <div className="font-medium break-words">
              {user.full_name || "-"}
            </div>
            <div className="text-sm text-muted-foreground break-all">
              {user.email}
            </div>
          </div>
          <UserStatusBadge status={user.status} className="shrink-0" />
        </div>

        <Field label="תפקידים">
          <UserRolesEditor
            user={user}
            roleLabels={roleLabels}
            actions={actions}
          />
        </Field>
        <Field label="איש צוות">
          <TeamMemberSelect
            value={user.campaigner_id}
            label={user.campaigner_name}
            options={campaigners}
            onChange={(id) => actions.setCampaigner(user, id)}
            ariaLabel="איש צוות"
            className="text-sm"
          />
        </Field>
        <Field label="איש מכירות">
          <TeamMemberSelect
            value={user.sales_person_id}
            label={user.sales_person_name}
            options={salesPeople}
            onChange={(id) => actions.setSalesPerson(user, id)}
            ariaLabel="איש מכירות"
            className="text-sm"
          />
        </Field>
        {user.sales_person_id && (
          <Field label="סוכנויות איש מכירות">
            <Button
              variant="outline"
              size="sm"
              onClick={() => actions.editSalesPersonAgencies(user)}
              className="h-8 text-sm w-full justify-start truncate"
            >
              {props.salesPersonAgencyNames(user) || "אין סוכנויות"}
            </Button>
          </Field>
        )}

        <div className="flex flex-col gap-2 pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => actions.editName(user)}
          >
            ערוך שם
          </Button>
          <UserActionButtons user={user} {...props} />
        </div>
      </div>
    </Card>
  );
}

/** A labelled block inside the card. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label}:</p>
      {children}
    </div>
  );
}
