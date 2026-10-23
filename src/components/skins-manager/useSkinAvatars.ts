import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCarmenSkins } from "@/hooks/useCarmenSkins";
import { validateAvatarFile } from "@/lib/profileAvatars";

/** Skin avatar lookup and upload/removal, backed by the Carmen skins store. */
export function useSkinAvatars() {
  const carmenSkins = useCarmenSkins();
  const avatarFor = (slug?: string) =>
    carmenSkins.skins.find((x) => x.slug === slug)?.avatarUrl;

  const upload = useMutation({
    mutationFn: ({ slug, file }: { slug: string; file: File | null }) =>
      carmenSkins.setSkinAvatar(slug, file),
    onSuccess: (_, { file }) =>
      toast.success(file ? "תמונת הסקין עודכנה" : "תמונת הסקין הוסרה"),
    onError: (e: Error) =>
      toast.error("עדכון התמונה נכשל: " + (e?.message || e)),
  });

  const changeAvatar = (slug: string, file: File | null) => {
    const invalid = file && validateAvatarFile(file);
    if (invalid) return toast.error(invalid);
    upload.mutate({ slug, file });
  };

  return {
    avatarFor,
    avatarBusy: upload.isPending,
    changeAvatar,
    canEdit: carmenSkins.canEdit,
  };
}

export type SkinAvatars = ReturnType<typeof useSkinAvatars>;
