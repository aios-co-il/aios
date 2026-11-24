import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { UserRole } from "@/hooks/useUserRole";
import type { ManagedUser } from "../userListTypes";
import { roleDefaultModules } from "../roleDefaultModules";
import { AssignTenantFields } from "./AssignTenantFields";
import { useAssignToTenant } from "./useAssignToTenant";
import { useUserTenantIds } from "./useUserTenantIds";

const DEFAULT_ROLE: UserRole = "campaigner";

/**
 * Adds an existing user to another organization the caller manages: the
 * user gets access to it, with the role, agencies, clients and modules
 * chosen here. Their other organizations are left as they are.
 */
export function AssignTenantDialog({
  user,
  tenantOptions,
  roleLabels,
  onClose,
}: {
  user: ManagedUser | null;
  tenantOptions: Array<{ id: string; name: string }>;
  roleLabels: Record<UserRole, string>;
  onClose: () => void;
}) {
  const [tenantId, setTenantId] = useState("");
  const [role, setRole] = useState<UserRole>(DEFAULT_ROLE);
  const [agencyIds, setAgencyIds] = useState<Array<string>>([]);
  const [clientIds, setClientIds] = useState<Array<string>>([]);
  const [modules, setModules] = useState(roleDefaultModules(DEFAULT_ROLE));
  const { data: memberOf = [] } = useUserTenantIds(user?.id);
  const assign = useAssignToTenant(user, close);

  const available = tenantOptions.filter(
    (tenant) => !memberOf.includes(tenant.id),
  );

  function close() {
    setTenantId("");
    selectRole(DEFAULT_ROLE);
    onClose();
  }

  // Agencies and clients belong to one organization, so a new choice of
  // organization starts them over.
  function selectTenant(next: string) {
    setTenantId(next);
    setAgencyIds([]);
    setClientIds([]);
  }

  function selectRole(next: UserRole) {
    setRole(next);
    setAgencyIds([]);
    setClientIds([]);
    setModules(roleDefaultModules(next));
  }

  function submit() {
    assign.mutate({
      tenantId,
      role,
      agencyIds,
      clientIds: role === "campaigner" ? clientIds : [],
      modulePermissions: modules,
    });
  }

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>שיוך לארגון נוסף</DialogTitle>
          <DialogDescription>
            {user?.full_name || user?.email} יקבל גישה לארגון שתבחר, עם התפקיד
            והמודולים שתבחר כאן. התפקידים וההרשאות שלו בארגונים האחרים לא ישתנו.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <AssignTenantFields
            tenants={available}
            tenantId={tenantId}
            onTenantChange={selectTenant}
            roleLabels={roleLabels}
            role={role}
            onRoleChange={selectRole}
            agencyIds={agencyIds}
            onAgencyIdsChange={setAgencyIds}
            clientIds={clientIds}
            onClientIdsChange={setClientIds}
            modules={modules}
            onModulesChange={setModules}
          />
        </div>
        <div className="shrink-0 pt-4 border-t">
          <Button
            className="w-full"
            onClick={submit}
            disabled={!tenantId || assign.isPending}
          >
            {assign.isPending ? "משייך..." : "שייך לארגון"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
