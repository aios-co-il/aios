/**
 * How Carmen addresses a user in Hebrew (`profiles.gender`); `null` is unknown and gets the
 * plural. Dependency-free so the profile screen imports the same values.
 */
export const ADDRESS_GENDERS = ["male", "female"] as const;

export type AddressGender = (typeof ADDRESS_GENDERS)[number] | null;

/** The stored value narrowed to a known gender; anything else is unknown. */
export function toAddressGender(
  value: string | null | undefined,
): AddressGender {
  return value === "male" || value === "female" ? value : null;
}
