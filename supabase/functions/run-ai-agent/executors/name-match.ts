import { scoreNameMatch } from "../../_shared/staff-whatsapp.ts";

/** Preserves the existing scoreNameMatchSafe behavior at its extracted boundary. */
export function scoreNameMatchSafe(fullName: string, query: string): number {
  return scoreNameMatch(fullName, query);
}
