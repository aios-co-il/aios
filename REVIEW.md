# Code review conventions

Rules every change follows; reviewers and review bots check PRs against them. Each rule came from repeated human review feedback.

## Placement

- **Colocate code with its only caller.** A helper used by one edge function lives in that function's folder (`supabase/functions/<fn>/`), test beside it. `supabase/functions/_shared/` holds only code that two or more functions import.
- A new `*.test.ts` joins the CI test list in `.github/workflows/ci-frontend.yml` in the same PR.

## Shape

- **Keep the main flow short.** Pull a multi-step block into a named function (`const existingLead = await getExistingLead(...)`) so the handler reads as a sequence of intents.
- **Helpers go at the bottom** of the file, below the entry point (`Deno.serve`, the component, the exported function).
- **Write the direct form**: return a boolean expression instead of `if (...) return false; return true;`.

## Comments

- **Comments explain _why_**: a constraint, a trade-off, a gotcha the code cannot show. A comment that restates the code is deleted.
- **Document functions with JSDoc** (`/** ... */`) above the declaration, not `//` lines.

## Database access

- **Upsert where a unique constraint exists** (`upsert(row, { onConflict, ignoreDuplicates })`) rather than select-then-insert. Keep select-then-insert only when an upsert would overwrite data, and say so in a one-line comment.

## PR description

- **Answer the obvious question up front.** When the change deliberately skips the expected approach, the PR description states why.
