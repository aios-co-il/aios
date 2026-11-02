import { CarmenPortrait } from "@/components/carmen-profile/CarmenPortrait";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2, ImagePlus, Trash2 } from "lucide-react";
import type { SkinDraft } from "./types";
import type { SkinAvatars } from "./useSkinAvatars";

export function SkinAvatarEditor({
  editing,
  avatars,
}: {
  editing: SkinDraft;
  avatars: SkinAvatars;
}) {
  const { avatarFor, avatarBusy, changeAvatar, canEdit } = avatars;
  return (
    <div className="flex items-center justify-end gap-3 rounded-lg border p-3">
      <div className="space-y-1 text-right">
        <Label>תמונת פרופיל לסקין</Label>
        {editing.id && editing.scope === "tenant" ? (
          <div className="flex flex-wrap justify-end gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
              {avatarBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImagePlus className="h-3.5 w-3.5" />
              )}
              {avatarFor(editing.slug) ? "החלפת תמונה" : "העלאת תמונה"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                disabled={avatarBusy || !canEdit}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f && editing.slug) changeAvatar(editing.slug, f);
                }}
              />
            </label>
            {avatarFor(editing.slug) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                disabled={avatarBusy}
                onClick={() => changeAvatar(editing.slug!, null)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                ברירת מחדל
              </Button>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            שמור את הסקין כדי להוסיף תמונה. PNG / JPG / WebP עד 5MB.
          </p>
        )}
      </div>
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted">
        {avatarFor(editing.slug) ? (
          <CarmenPortrait
            image={avatarFor(editing.slug)}
            name={editing.name}
            custom
            className="!h-16 !w-16"
          />
        ) : (
          <Sparkles className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
    </div>
  );
}
