import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  type AddressGender,
  toAddressGender,
} from "../../supabase/functions/_shared/carmen/address-gender.ts";

/** The radio value for an unknown gender; Carmen then uses the plural. */
const UNSET = "unset";

/** The card title's id, which names the radio group for screen readers. */
const TITLE_ID = "address-gender-title";

const OPTIONS: Array<{ value: string; label: string }> = [
  { value: "male", label: "לשון זכר" },
  { value: "female", label: "לשון נקבה" },
  { value: UNSET, label: "לשון רבים (ברירת מחדל)" },
];

/** The signed-in user's choice of how Carmen addresses them in Hebrew (`profiles.gender`). */
export function AddressGenderSettings() {
  const { userId } = useCurrentUser();
  const queryClient = useQueryClient();
  const queryKey = ["my-profile", userId, "gender"];

  const { data: gender } = useQuery({
    queryKey,
    queryFn: userId ? () => loadGender(userId) : skipToken,
  });

  const save = useMutation({
    mutationFn: (next: AddressGender) => saveGender(userId, next),
    // The saved value becomes the cached one, so the selection holds without a refetch.
    onSuccess: (_data, next) => {
      queryClient.setQueryData(queryKey, next);
      toast.success("נשמר. כרמן תפנה אליך כך מההודעה הבאה.");
    },
    onError: (error: Error) => {
      console.error("[AddressGenderSettings] save failed", error);
      toast.error("השמירה נכשלה, אפשר לנסות שוב.");
    },
  });

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle id={TITLE_ID}>איך כרמן פונה אליך</CardTitle>
        <CardDescription>
          בעברית כל פועל מסמן מגדר. בלי בחירה, כרמן פונה בלשון רבים.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          dir="rtl"
          aria-labelledby={TITLE_ID}
          value={gender ?? UNSET}
          onValueChange={(value) => save.mutate(toAddressGender(value))}
          disabled={!userId || save.isPending}
          className="flex flex-wrap gap-6"
        >
          {OPTIONS.map((option) => (
            <div key={option.value} className="flex items-center gap-2">
              <RadioGroupItem
                value={option.value}
                id={`address-gender-${option.value}`}
              />
              <Label htmlFor={`address-gender-${option.value}`}>
                {option.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </CardContent>
    </Card>
  );
}

/** The user's stored address gender. */
async function loadGender(userId: string): Promise<AddressGender> {
  const { data, error } = await supabase
    .from("profiles")
    .select("gender")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return toAddressGender(data?.gender);
}

/** Saves the user's own address gender; RLS lets a user update only their own profile. */
async function saveGender(userId: string | undefined, gender: AddressGender) {
  if (!userId) {
    throw new Error("not signed in");
  }
  const { error } = await supabase
    .from("profiles")
    .update({ gender })
    .eq("id", userId);
  if (error) {
    throw error;
  }
}
