import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { InviteAgencyOption } from "./useInviteAgencyOptions";

/** Picks the agencies a team card is linked to. */
export function AgencyCheckboxList({
  agencies,
  value,
  onChange,
  idPrefix,
}: {
  agencies: Array<InviteAgencyOption>;
  value: Array<string>;
  onChange: (next: Array<string>) => void;
  idPrefix: string;
}) {
  function toggle(agencyId: string, checked: boolean) {
    onChange(
      checked ? [...value, agencyId] : value.filter((id) => id !== agencyId),
    );
  }

  return (
    <div>
      <Label>סוכנויות</Label>
      <div className="border rounded-md p-3 space-y-2 max-h-32 overflow-y-auto mt-2">
        {agencies.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין סוכנויות זמינות</p>
        ) : (
          agencies.map((agency) => (
            <div key={agency.id} className="flex items-center gap-2">
              <Checkbox
                id={`${idPrefix}-${agency.id}`}
                checked={value.includes(agency.id)}
                onCheckedChange={(checked) => toggle(agency.id, !!checked)}
              />
              <Label
                htmlFor={`${idPrefix}-${agency.id}`}
                className="text-sm font-medium cursor-pointer"
              >
                {agency.name}
              </Label>
            </div>
          ))
        )}
      </div>
      {value.length > 0 && (
        <p className="text-xs text-muted-foreground mt-1">
          נבחרו {value.length} סוכנויות
        </p>
      )}
    </div>
  );
}
