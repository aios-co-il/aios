import { Label } from "@/components/ui/label";
import { LtrField } from "./LtrField";
import type { PbxSettingsData, SetPbxField } from "./types";

const PARAM_FIELDS = [
  ["param_caller", "מספר המתקשר"],
  ["param_destination", "המספר אליו מתקשרים"],
  ["param_extension", "מספר שלוחה"],
  ["param_call_id", "מזהה שיחה"],
] as const;

interface Props {
  form: PbxSettingsData;
  set: SetPbxField;
}

/** Field names the PBX expects, plus the default caller number and extension. */
export function PbxFieldNames({ form, set }: Props) {
  return (
    <>
      <div>
        <Label className="text-sm font-semibold">
          שמות השדות שהמרכזיה מצפה לקבל
        </Label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
          {PARAM_FIELDS.map(([key, label]) => (
            <LtrField
              key={key}
              small
              label={label}
              value={form[key]}
              onChange={(v) => set(key, v)}
            />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LtrField
          label="מספר מתקשר ברירת מחדל"
          value={form.default_caller_number}
          onChange={(v) => set("default_caller_number", v)}
          placeholder="035551234"
        />
        <LtrField
          label="שלוחה ברירת מחדל"
          value={form.default_extension}
          onChange={(v) => set("default_extension", v)}
          placeholder="101"
        />
      </div>
    </>
  );
}
