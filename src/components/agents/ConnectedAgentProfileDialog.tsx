import { ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PROFILE_LIMITS } from "@/lib/carmenAgentProfile";
import { validateAvatarFile } from "@/lib/profileAvatars";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConnectedAgentAvatar } from "./ConnectedAgentAvatar";
import type { ConnectedAgentProfileEditor } from "./useConnectedAgentProfileEditor";

export function ConnectedAgentProfileDialog({
  editor,
}: {
  editor: ConnectedAgentProfileEditor;
}) {
  const { editing, draft, setDraft, file, setFile, preview, save, close } =
    editor;
  return (
    <Dialog open={!!editing} onOpenChange={(o) => !o && close()}>
      <DialogContent
        className="max-h-[90vh] max-w-lg overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="text-right">
            פרופיל · {editing?.label}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-right">
          <div className="flex items-center justify-end gap-3">
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
              <ImagePlus className="h-3.5 w-3.5" />
              {file ? file.name : "תמונת פרופיל"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  const invalid = validateAvatarFile(f);
                  if (invalid) return toast.error(invalid);
                  setFile(f);
                }}
              />
            </label>
            {editing && (
              <ConnectedAgentAvatar
                route={{
                  ...editing,
                  avatarUrl: preview ?? editing.avatarUrl,
                }}
              />
            )}
          </div>
          <div className="space-y-1">
            <Label>שם תצוגה</Label>
            <Input
              value={draft.displayName ?? ""}
              maxLength={PROFILE_LIMITS.displayName}
              placeholder={editing?.label}
              onChange={(e) =>
                setDraft({ ...draft, displayName: e.target.value })
              }
            />
          </div>
          <div className="space-y-1">
            <Label>פרסונה (מי הוא/היא)</Label>
            <Textarea
              value={draft.persona ?? ""}
              maxLength={PROFILE_LIMITS.persona}
              className="min-h-[60px]"
              onChange={(e) => setDraft({ ...draft, persona: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>הוראות לסוכן</Label>
            <Textarea
              value={draft.instructions ?? ""}
              maxLength={PROFILE_LIMITS.instructions}
              className="min-h-[120px]"
              onChange={(e) =>
                setDraft({ ...draft, instructions: e.target.value })
              }
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={close}>
            ביטול
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && (
              <Loader2 className="ml-1 h-4 w-4 animate-spin" />
            )}
            שמור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
