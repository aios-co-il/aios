/**
 * The names report recipients go by when their card or row has none.
 * Deliveries, logs and the settings screen all read them here, so a rename
 * touches this file only.
 */

/** A staff member's card name, else the generic member name. */
export function memberName(
  member: { full_name: string | null } | undefined,
): string {
  return member?.full_name?.trim() || "חבר צוות";
}

/** An owner's card name, else the generic owner name. */
export function ownerName(member: { full_name: string | null }): string {
  return member.full_name?.trim() || "בעלים";
}

/** An extra phone's label, else the generic extra-phone name. */
export function extraPhoneName(label: string | null): string {
  return label?.trim() || "מספר נוסף";
}
