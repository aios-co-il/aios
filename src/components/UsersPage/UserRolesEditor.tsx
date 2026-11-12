import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UserRole } from "@/hooks/useUserRole";
import type { ManagedUser, UserRowActions } from "./userListTypes";
import { roleBadgeColors } from "./userRoleStyles";

/** The user's role badges, each removable after a confirm, plus an add-role picker. */
export function UserRolesEditor({
  user,
  roleLabels,
  actions,
}: {
  user: ManagedUser;
  roleLabels: Record<UserRole, string>;
  actions: Pick<UserRowActions, "addRole" | "removeRole">;
}) {
  const missingRoles = (Object.keys(roleLabels) as Array<UserRole>).filter(
    (role) => !user.roles.includes(role),
  );

  function removeRole(role: UserRole) {
    if (confirm(`האם להסיר את תפקיד ${roleLabels[role]}?`)) {
      actions.removeRole(user, role);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {user.roles.map((role) => (
        <Badge
          key={role}
          className={`${roleBadgeColors[role] || "bg-gray-500"} relative group text-xs`}
        >
          {roleLabels[role] ?? role}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeRole(role);
            }}
            className="mr-1 hover:text-red-600 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
            title="הסר תפקיד"
            aria-label={`הסר תפקיד ${roleLabels[role] ?? role}`}
          >
            ×
          </button>
        </Badge>
      ))}
      {missingRoles.length > 0 && (
        <Select
          value=""
          onValueChange={(role) => actions.addRole(user, role as UserRole)}
        >
          <SelectTrigger
            className="w-[40px] h-6 px-2 text-xs"
            aria-label="הוסף תפקיד"
          >
            <SelectValue>+</SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-background z-50">
            {missingRoles.map((role) => (
              <SelectItem key={role} value={role}>
                {roleLabels[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
