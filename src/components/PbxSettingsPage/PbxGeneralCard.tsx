import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { PbxSettingsData, SetPbxField } from "./types";

interface Props {
  form: PbxSettingsData;
  set: SetPbxField;
  isActive: boolean;
  setIsActive: (v: boolean) => void;
}

export function PbxGeneralCard({ form, set, isActive, setIsActive }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>פרטי המרכזיה</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>שם המרכזיה</Label>
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="לדוגמה: מרכזיית משרד"
          />
        </div>
        <div className="flex items-center gap-3 pt-7">
          <Switch checked={isActive} onCheckedChange={setIsActive} />
          <Label>{isActive ? "פעיל" : "מושבת"}</Label>
        </div>
      </CardContent>
    </Card>
  );
}
