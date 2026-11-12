import { createContext } from "react";
import type { AddressGender } from "../../../../supabase/functions/_shared/carmen/address-gender";

/** Which Mini Me set a user sees: the male figure or the female one. */
export type MiniMeGender = "male" | "female";

export const MINI_ME_GENDERS: Array<MiniMeGender> = ["male", "female"];

/**
 * The user's own choice (`profiles.minime_gender`) wins; without one the
 * Mini Me follows how Carmen addresses the user (`profiles.gender`), and is
 * male when that is unknown too.
 */
export function resolveMiniMeGender(
  choice: string | null | undefined,
  addressGender: AddressGender,
): MiniMeGender {
  if (choice === "male" || choice === "female") {
    return choice;
  }
  return addressGender === "female" ? "female" : "male";
}

/** The signed-in user's Mini Me set; male outside the app layout. */
export const MiniMeGenderContext = createContext<MiniMeGender>("male");
