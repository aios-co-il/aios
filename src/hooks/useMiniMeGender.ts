import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  type MiniMeGender,
  resolveMiniMeGender,
} from "@/components/carmen/MiniMe/miniMeGender";
import { toAddressGender } from "../../supabase/functions/_shared/carmen/address-gender";

/** The signed-in user's Mini Me set (`profiles.minime_gender`), and a way to change it. */
export function useMiniMeGender() {
  const { userId } = useCurrentUser();
  const queryClient = useQueryClient();
  const queryKey = ["my-profile", userId, "minime-gender"];

  const query = useQuery({
    queryKey,
    staleTime: 30 * 60 * 1000,
    queryFn: userId ? () => loadGender(userId) : skipToken,
  });

  const mutation = useMutation({
    mutationFn: (next: MiniMeGender) => saveGender(userId, next),
    // The saved value becomes the cached one, so every Mini Me switches at once.
    onSuccess: (_data, next) => queryClient.setQueryData(queryKey, next),
    onError: (error: Error) => {
      console.error("[useMiniMeGender] save failed", error);
      toast.error("השמירה נכשלה, אפשר לנסות שוב.");
    },
  });

  return {
    gender: query.data ?? "male",
    setGender: (next: MiniMeGender) => mutation.mutate(next),
    saving: mutation.isPending,
  };
}

/** The user's Mini Me set: their choice, else their address gender, else male. */
async function loadGender(userId: string): Promise<MiniMeGender> {
  const { data, error } = await supabase
    .from("profiles")
    .select("minime_gender, gender")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return resolveMiniMeGender(
    data?.minime_gender,
    toAddressGender(data?.gender),
  );
}

/** Saves the user's own choice; RLS lets a user update only their own profile. */
async function saveGender(userId: string | undefined, gender: MiniMeGender) {
  if (!userId) {
    throw new Error("not signed in");
  }
  const { error } = await supabase
    .from("profiles")
    .update({ minime_gender: gender })
    .eq("id", userId);
  if (error) {
    throw error;
  }
}
