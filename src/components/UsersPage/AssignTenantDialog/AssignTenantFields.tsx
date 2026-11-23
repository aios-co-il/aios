import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UserRole } from "@/hooks/useUserRole";
import { AgencyCheckboxList } from "../AgencyCheckboxList";
import { InviteClientsPicker } from "../InviteClientsPicker";
import { ModulePermissionsField } from "../ModulePermissionsField";
import { useInviteAgencyOptions } from "../useInviteAgencyOptions";

/** The organization, role, agencies, clients and modules for the assignment. */
export function AssignTenantFields(props: {
  tenants: Array<{ id: string; name: string }>;
  tenantId: string;
  onTenantChange: (tenantId: string) => void;
  roleLabels: Record<UserRole, string>;
  role: UserRole;
  onRoleChange: (role: UserRole) => void;
  agencyIds: Array<string>;
  onAgencyIdsChange: (ids: Array<string>) => void;
  clientIds: Array<string>;
  onClientIdsChange: (ids: Array<string>) => void;
  modules: Array<string>;
  onModulesChange: (modules: Array<string>) => void;
}) {
  const { data: agencies = [] } = useInviteAgencyOptions(props.tenantId);

  if (props.tenants.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        המשתמש כבר שייך לכל הארגונים שאתה מנהל.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="assign-tenant">ארגון</Label>
        <Select value={props.tenantId} onValueChange={props.onTenantChange}>
          <SelectTrigger id="assign-tenant">
            <SelectValue placeholder="בחר ארגון" />
          </SelectTrigger>
          <SelectContent>
            {props.tenants.map((tenant) => (
              <SelectItem key={tenant.id} value={tenant.id}>
                {tenant.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {props.tenantId && (
        <>
          <div>
            <Label htmlFor="assign-role">תפקיד</Label>
            <Select
              value={props.role}
              onValueChange={(value) => {
                if (isRole(props.roleLabels, value)) {
                  props.onRoleChange(value);
                }
              }}
            >
              <SelectTrigger id="assign-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(props.roleLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AgencyCheckboxList
            agencies={agencies}
            value={props.agencyIds}
            onChange={props.onAgencyIdsChange}
            idPrefix="assign-agency"
          />
          {props.role === "campaigner" && (
            <InviteClientsPicker
              tenantId={props.tenantId}
              agencyIds={props.agencyIds}
              value={props.clientIds}
              onChange={props.onClientIdsChange}
            />
          )}
          <ModulePermissionsField
            value={props.modules}
            onChange={props.onModulesChange}
            idPrefix="assign-perms"
          />
        </>
      )}
    </div>
  );
}

/** Whether the picked value is one of the offered roles. */
function isRole(
  labels: Record<UserRole, string>,
  value: string,
): value is UserRole {
  return Object.prototype.hasOwnProperty.call(labels, value);
}
