/** Constant-time string comparison for the webhook secret. */
export function secretsMatch(expected: string, provided: string): boolean {
  if (!expected || expected.length !== provided.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++)
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}
