import type { IdentityRow, PrivatePhoneRow } from "./carmenAccessAutomation";

export function normalizePrivatePhone(phone: string): string;
export function decodePrivatePhoneRows(value: unknown): PrivatePhoneRow[];
export function mergePrivatePhoneAllowlist(params: {
  policyPhones?: PrivatePhoneRow[];
  identities?: IdentityRow[];
  automationPhones?: string[];
}): PrivatePhoneRow[];
