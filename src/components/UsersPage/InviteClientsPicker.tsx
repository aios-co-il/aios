import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useInviteClientOptions } from "./useInviteClientOptions";

/**
 * Picks the clients a new campaigner works on. The invite puts the
 * campaigner's team card on each one, which is what lets them see it.
 * When agencies are chosen, only those agencies' clients are listed, plus
 * any client already checked, so nothing selected is ever hidden.
 */
export function InviteClientsPicker({
  tenantId,
  agencyIds,
  value,
  onChange,
}: {
  tenantId: string | null | undefined;
  agencyIds: Array<string>;
  value: Array<string>;
  onChange: (next: Array<string>) => void;
}) {
  const [search, setSearch] = useState("");
  const {
    data: clients = [],
    isLoading,
    error,
  } = useInviteClientOptions(tenantId, true);

  const term = search.trim().toLowerCase();
  const visible = clients.filter(
    (client) =>
      value.includes(client.id) ||
      ((agencyIds.length === 0 ||
        (client.agency_id !== null && agencyIds.includes(client.agency_id))) &&
        (!term || client.name.toLowerCase().includes(term))),
  );

  function toggle(clientId: string, checked: boolean) {
    onChange(
      checked ? [...value, clientId] : value.filter((id) => id !== clientId),
    );
  }

  return (
    <div>
      <Label>לקוחות משויכים</Label>
      <p className="text-xs text-muted-foreground mt-1 mb-2">
        הקמפיינר יראה את הלקוחות שתסמן, ויוכל גם להוסיף לקוחות חדשים בעצמו.
      </p>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="חיפוש לקוח..."
        className="mb-2"
      />
      <div className="border rounded-md p-3 space-y-2 max-h-48 overflow-y-auto">
        {error ? (
          <p className="text-sm text-destructive">שגיאה בטעינת לקוחות</p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">טוען...</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין לקוחות להצגה</p>
        ) : (
          visible.map((client) => (
            <label
              key={client.id}
              className="flex items-center gap-2 text-sm cursor-pointer"
            >
              <Checkbox
                checked={value.includes(client.id)}
                onCheckedChange={(checked) => toggle(client.id, !!checked)}
              />
              {client.name}
            </label>
          ))
        )}
      </div>
      {value.length > 0 && (
        <p className="text-xs text-muted-foreground mt-1">
          נבחרו {value.length} לקוחות
        </p>
      )}
    </div>
  );
}
