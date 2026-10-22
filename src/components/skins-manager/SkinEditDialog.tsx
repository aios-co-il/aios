import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import type { SkinDraft } from "./types";
import type { SkinAvatars } from "./useSkinAvatars";
import { SkinAvatarEditor } from "./SkinAvatarEditor";
import { SkinPersonaFields } from "./SkinPersonaFields";
import { SkinRoutingFields } from "./SkinRoutingFields";

export function SkinEditDialog({
  editing,
  setEditing,
  avatars,
  isSaving,
  onSave,
}: {
  editing: SkinDraft | null;
  setEditing: (s: SkinDraft | null) => void;
  avatars: SkinAvatars;
  isSaving: boolean;
  onSave: (s: SkinDraft) => void;
}) {
  return (
    <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="text-right">
            {editing?.id ? "עריכת סקין" : "סקין חדש"}
          </DialogTitle>
        </DialogHeader>
        {editing && (
          <div className="space-y-3 text-right">
            <SkinAvatarEditor editing={editing} avatars={avatars} />
            <SkinPersonaFields editing={editing} setEditing={setEditing} />
            <SkinRoutingFields editing={editing} setEditing={setEditing} />
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setEditing(null)}>
            ביטול
          </Button>
          <Button
            onClick={() => editing && onSave(editing)}
            disabled={isSaving || !editing?.name || !editing?.slug}
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
            שמור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
