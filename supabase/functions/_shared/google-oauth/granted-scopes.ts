import { z } from "npm:zod@3.25.76";

const tokenResponseSchema = z.object({ scope: z.string().default("") });

/**
 * Scopes from `required` that Google's token response did not grant. With
 * granular consent a user can untick a scope and Google still issues tokens.
 */
export function missingGrantedScopes(
  tokenResponse: unknown,
  required: ReadonlyArray<string>,
): Array<string> {
  const granted = new Set(
    tokenResponseSchema.parse(tokenResponse).scope.split(" "),
  );

  return required.filter((scope) => !granted.has(scope));
}
