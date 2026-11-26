/**
 * Which Mini Me set a user sees and how its render files are named. Dependency-free, so the
 * site, the build step and the edge functions read the same rule.
 */
import type { AddressGender } from "./address-gender.ts";

/** The male figure or the female one. */
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

/** The file name of one skin's render in one set, inside the Mini Me `images/` folder. */
export function miniMeRenderFile(
  skin: string | undefined,
  gender: MiniMeGender,
): string {
  return `${skin}-${gender}.webp`;
}
