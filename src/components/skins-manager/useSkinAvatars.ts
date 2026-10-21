import { useState } from "react";
import { toast } from "sonner";
import { useCarmenSkins } from "@/hooks/useCarmenSkins";
import { validateAvatarFile } from "@/lib/profileAvatars";

// Skin avatar lookup and upload/removal, backed by the Carmen skins store.
export function useSkinAvatars() {
  const carmenSkins = useCarmenSkins();
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarFor = (slug?: string) =>
    carmenSkins.skins.find((x) => x.slug === slug)?.avatarUrl;

  const changeAvatar = async (slug: string, file: File | null) => {
    if (file) {
      const invalid = validateAvatarFile(file);
      if (invalid) return toast.error(invalid);
    }
    setAvatarBusy(true);
    try {
      await carmenSkins.setSkinAvatar(slug, file);
      toast.success(file ? "תמונת הסקין עודכנה" : "תמונת הסקין הוסרה");
    } catch (e: any) {
      toast.error("עדכון התמונה נכשל: " + (e?.message || e));
    } finally {
      setAvatarBusy(false);
    }
  };

  return {
    avatarFor,
    avatarBusy,
    changeAvatar,
    canEdit: carmenSkins.canEdit,
  };
}

export type SkinAvatars = ReturnType<typeof useSkinAvatars>;
