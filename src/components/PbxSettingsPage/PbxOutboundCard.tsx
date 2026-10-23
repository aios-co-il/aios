import { Webhook } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Code, CodeBlock } from "./Code";
import { buildOutboundExample } from "./examples";
import { LtrField } from "./LtrField";
import { PbxFieldNames } from "./PbxFieldNames";
import type { PbxSettingsData, SetPbxField } from "./types";

interface Props {
  form: PbxSettingsData;
  set: SetPbxField;
}

export function PbxOutboundCard({ form, set }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Webhook className="h-5 w-5" />
          Webhook יוצא — חיוג מה-CRM למרכזיה
        </CardTitle>
        <CardDescription>
          בלחיצה על "חייג" בכרטיס ליד, המערכת שולחת לכתובת הזו את מספר המתקשר,
          המספר אליו מתקשרים ומספר השלוחה של הנציג
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <LtrField
            className="md:col-span-2"
            label="כתובת ה-Webhook של המרכזיה"
            value={form.outbound_url}
            onChange={(v) => set("outbound_url", v)}
            placeholder="https://your-pbx.example.com/api/dial"
          />
          <div className="space-y-2">
            <Label>שיטה</Label>
            <Select
              value={form.outbound_method}
              onValueChange={(v) =>
                set("outbound_method", v as PbxSettingsData["outbound_method"])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="GET">GET</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>פורמט גוף</Label>
            <Select
              value={form.outbound_format}
              disabled={form.outbound_method === "GET"}
              onValueChange={(v) =>
                set("outbound_format", v as PbxSettingsData["outbound_format"])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="json">JSON</SelectItem>
                <SelectItem value="form">Form (urlencoded)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <LtrField
            label="כותרת אימות (אופציונלי)"
            value={form.outbound_auth_header}
            onChange={(v) => set("outbound_auth_header", v)}
            placeholder="Authorization"
          />
          <LtrField
            label="ערך כותרת האימות"
            type="password"
            value={form.outbound_auth_value}
            onChange={(v) => set("outbound_auth_value", v)}
            placeholder="Bearer xxxxx"
          />
        </div>

        <PbxFieldNames form={form} set={set} />

        <div className="space-y-2">
          <Label className="text-sm font-semibold">דוגמת בקשה שתישלח</Label>
          <CodeBlock code={buildOutboundExample(form)} />
          <p className="text-xs text-muted-foreground">
            <Code>call_id</Code> הוא מזהה השיחה במערכת. כדאי שהמרכזיה תחזיר אותו
            ב-Webhook ההקלטה כדי שההקלטה תשויך בדיוק לשיחה הזו.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
