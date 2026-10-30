import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { FormFieldsProps } from "./modelBrainForm";

/** The brain's profile: persona prompt, sampling limits, picker description and color. */
export function ModelBrainProfileFields({ f, set }: FormFieldsProps) {
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="text-sm font-medium">פרופיל</div>
      <div>
        <Label>הנחיית מערכת (פרסונה ותפקיד)</Label>
        <Textarea
          rows={4}
          value={f.systemPrompt}
          onChange={(e) => set("systemPrompt", e.target.value)}
          placeholder="אתה מומחה קופירייטינג. ענה בעברית, קצר ולעניין."
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>טמפרטורה (0–2)</Label>
          <Input
            type="number"
            step="0.1"
            min={0}
            max={2}
            value={f.temperature}
            onChange={(e) => set("temperature", e.target.value)}
            dir="ltr"
          />
        </div>
        <div>
          <Label>מקסימום טוקנים</Label>
          <Input
            type="number"
            min={16}
            max={32000}
            value={f.maxTokens}
            onChange={(e) => set("maxTokens", e.target.value)}
            dir="ltr"
          />
        </div>
      </div>
      <div>
        <Label>תיאור קצר</Label>
        <Input
          value={f.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="למה המוח הזה טוב"
        />
      </div>
      <div className="space-y-2 rounded-md bg-muted/40 p-2">
        <div className="text-xs font-medium">נתב חכם</div>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="brain-tier">מוח חינמי (הנתב בוחר בו קודם)</Label>
          <Switch
            id="brain-tier"
            checked={f.tier === "free"}
            onCheckedChange={(v) => set("tier", v ? "free" : "premium")}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="brain-client-data">
            מותר לשלוח לו מידע של לקוחות
          </Label>
          <Switch
            id="brain-client-data"
            checked={f.clientDataOk}
            onCheckedChange={(v) => set("clientDataOk", v)}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor="brain-color">צבע בבורר</Label>
        <input
          id="brain-color"
          type="color"
          value={f.color}
          onChange={(e) => set("color", e.target.value)}
          className="h-8 w-12 cursor-pointer rounded border bg-transparent"
        />
      </div>
    </div>
  );
}
