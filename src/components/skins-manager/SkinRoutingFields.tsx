import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toList, type SkinDraft } from "./types";

// Tools, triggers, handoffs and the active toggle of the skin editor.
export function SkinRoutingFields({
  editing,
  setEditing,
}: {
  editing: SkinDraft;
  setEditing: (s: SkinDraft) => void;
}) {
  return (
    <>
      <div className="space-y-1">
        <Label>כלים מותרים (מופרד בפסיק/שורה)</Label>
        <Textarea
          value={(editing.allowed_tools || []).join(", ")}
          onChange={(e) =>
            setEditing({
              ...editing,
              allowed_tools: toList(e.target.value),
            })
          }
          className="text-right min-h-[50px] font-mono text-sm"
        />
      </div>
      <div className="space-y-1">
        <Label>טריגרים (מילים שמפעילות את הסקין)</Label>
        <Textarea
          value={(editing.triggers || []).join(", ")}
          onChange={(e) =>
            setEditing({ ...editing, triggers: toList(e.target.value) })
          }
          className="text-right min-h-[50px]"
        />
      </div>
      <div className="space-y-1">
        <Label>handoff — סקינז שאפשר להעביר אליהם (slugs)</Label>
        <Input
          value={(editing.handoff_slugs || []).join(", ")}
          onChange={(e) =>
            setEditing({
              ...editing,
              handoff_slugs: toList(e.target.value),
            })
          }
          className="text-right font-mono text-sm"
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <Label>פעיל</Label>
        <Switch
          checked={editing.is_active ?? true}
          onCheckedChange={(c) => setEditing({ ...editing, is_active: c })}
        />
      </div>
    </>
  );
}
