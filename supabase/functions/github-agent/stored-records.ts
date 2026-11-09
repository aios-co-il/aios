import { z } from "npm:zod@3.25.76";

const proposedFixSchema = z.object({
  file_path: z.string().min(1),
  new_code: z.string().min(1),
});

/** file_path/new_code of an approved fix, or null when either is missing. */
export function readProposedFix(
  raw: unknown,
): { filePath: string; newCode: string } | null {
  const parsed = proposedFixSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const { file_path, new_code } = parsed.data;
  if (!file_path || !new_code) {
    return null;
  }
  return { filePath: file_path, newCode: new_code };
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

/** Validate the stored profile fields consumed by the GitHub agent. */
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
