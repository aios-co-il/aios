import { z } from "npm:zod@3.25.76";

const proposedFixSchema = z
  .object({ file_path: z.unknown(), new_code: z.unknown() })
  .catch({});

/** file_path/new_code of an approved fix, or null when either is missing. */
export function readProposedFix(
  raw: unknown,
): { filePath: string; newCode: string } | null {
  const { file_path, new_code } = proposedFixSchema.parse(raw);
  if (!file_path || !new_code) return null;
  return { filePath: String(file_path), newCode: String(new_code) };
}

const credentialRepoSchema = z
  .object({ repo: z.string().min(1).optional().catch(undefined) })
  .catch({});

/** owner/name from the GitHub credential metadata, when it is set. */
export function readCredentialRepo(raw: unknown): string | undefined {
  return credentialRepoSchema.parse(raw).repo;
}

const profileSchema = z
  .object({ display_name: z.unknown(), email: z.unknown() })
  .catch({});

export function readProfile(raw: unknown): {
  display_name: string;
  email: string;
} {
  const { display_name, email } = profileSchema.parse(raw);
  return {
    display_name: String(display_name || "Unknown"),
    email: String(email || ""),
  };
}
