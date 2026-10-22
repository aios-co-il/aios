import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { SkinDraft } from "./types";

/** Identity and persona text fields of the skin editor (name → output template). */
export function SkinPersonaFields({
  editing,
  setEditing,
}: {
  editing: SkinDraft;
  setEditing: (s: SkinDraft) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>שם</Label>
          <Input
            value={editing.name || ""}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            className="text-right"
          />
        </div>
        <div className="space-y-1">
          <Label>slug (מזהה)</Label>
          <Input
            value={editing.slug || ""}
            disabled={!!editing.id}
            onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
            className="text-right font-mono text-sm"
            placeholder="campaigner"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label>תיאור (מתי להשתמש)</Label>
        <Input
          value={editing.description || ""}
          onChange={(e) =>
            setEditing({ ...editing, description: e.target.value })
          }
          className="text-right"
        />
      </div>
      <div className="space-y-1">
        <Label>🎯 מטרה (goal)</Label>
        <Input
          value={editing.goal || ""}
          onChange={(e) => setEditing({ ...editing, goal: e.target.value })}
          className="text-right"
        />
      </div>
      <div className="space-y-1">
        <Label>זהות / system prompt</Label>
        <Textarea
          value={editing.system_prompt || ""}
          onChange={(e) =>
            setEditing({ ...editing, system_prompt: e.target.value })
          }
          className="text-right min-h-[100px]"
        />
      </div>
      <div className="space-y-1">
        <Label>חוקים קשיחים (constraints)</Label>
        <Textarea
          value={editing.constraints || ""}
          onChange={(e) =>
            setEditing({ ...editing, constraints: e.target.value })
          }
          className="text-right min-h-[60px]"
          placeholder="חוקים שטון/מצב רוח לעולם לא דורסים"
        />
      </div>
      <div className="space-y-1">
        <Label>פרוצדורה (steps)</Label>
        <Textarea
          value={editing.steps || ""}
          onChange={(e) => setEditing({ ...editing, steps: e.target.value })}
          className="text-right min-h-[80px]"
        />
      </div>
      <div className="space-y-1">
        <Label>פורמט פלט (output template)</Label>
        <Textarea
          value={editing.output_template || ""}
          onChange={(e) =>
            setEditing({ ...editing, output_template: e.target.value })
          }
          className="text-right min-h-[60px]"
        />
      </div>
    </>
  );
}
