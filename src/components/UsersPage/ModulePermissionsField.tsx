import { PermissionsSelector } from "@/components/forms/PermissionsSelector";
import { Label } from "@/components/ui/label";
import { getAllModules } from "@/lib/modules";

/** Picks the modules a user can open, as a list of module ids. */
export function ModulePermissionsField({
  value,
  onChange,
  idPrefix,
}: {
  value: Array<string>;
  onChange: (next: Array<string>) => void;
  idPrefix: string;
}) {
  return (
    <div>
      <Label>הרשאות מודולים</Label>
      <div className="mt-2">
        <PermissionsSelector
          value={Object.fromEntries(
            getAllModules().map((module) => [
              module.id,
              value.includes(module.id),
            ]),
          )}
          onChange={(next) =>
            onChange(
              Object.entries(next)
                .filter(([, on]) => on)
                .map(([id]) => id),
            )
          }
          idPrefix={idPrefix}
        />
      </div>
      {value.length > 0 && (
        <p className="text-xs text-muted-foreground mt-2">
          נבחרו {value.length} מודולים
        </p>
      )}
      <p className="text-xs text-muted-foreground mt-1">
        מודולים שלא נבחרו יהיו נעולים למשתמש
      </p>
    </div>
  );
}
