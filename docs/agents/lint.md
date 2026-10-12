# ESLint cleanup

Run `pnpm lint` locally. Frontend CI runs the same full-repository command on
PRs to develop/main and branch builds. Warnings remain visible and do not fail CI;
parser/configuration failures and error-level rules still fail. No comparison
scripts, lint baseline, or bootstrap secret are required.

Fourteen rules with existing violations temporarily use `warn` in
`eslint.config.js`. Their recommended configurations remain enabled and all other
rules retain their configured severity. These warnings also apply to new code
until each rule is restored; CI does not distinguish old debt from new warnings.
The existing TypeScript gate is unchanged.

The full lint command covers TS/TSX in frontend, Supabase/Edge functions, tests,
and extension sources, plus ESLint's default JavaScript parsing. The existing
`dist` and ESLint dependency exclusions remain unchanged. The separate extension
still uses its own Bun setup when working on that product.

## Restore one rule at a time

Fix every occurrence of the rule under its linked ticket, then remove its
`warn` override to restore the inherited recommended `error` severity. Run the
full `pnpm lint` before committing; add focused regression coverage when fixes
change runtime behavior. Do not replace fixes with suppressions or new ignores.
Other rules can remain warnings while cleanup proceeds.

The inventory below was measured before warning overrides on develop
`49a3673e331c4bf65625f13a9127d0f2421690f3` using ESLint 9.39.4: 4,655 errors.
Counts are snapshots; remeasure when starting each ticket.

- [AIO-52 — @typescript-eslint/no-explicit-any](https://linear.app/aios-co/issue/AIO-52/fix-typescript-eslintno-explicit-any-violations-and-restore-default): 4416 occurrences across 560 file(s).
- [AIO-53 — no-empty](https://linear.app/aios-co/issue/AIO-53/fix-no-empty-violations-and-restore-default-eslint-severity): 99 occurrences across 35 file(s).
- [AIO-54 — prefer-const](https://linear.app/aios-co/issue/AIO-54/fix-prefer-const-violations-and-restore-default-eslint-severity): 48 occurrences across 35 file(s).
- [AIO-55 — no-useless-escape](https://linear.app/aios-co/issue/AIO-55/fix-no-useless-escape-violations-and-restore-default-eslint-severity): 44 occurrences across 13 file(s).
- [AIO-56 — no-case-declarations](https://linear.app/aios-co/issue/AIO-56/fix-no-case-declarations-violations-and-restore-default-eslint): 17 occurrences across 6 file(s).
- [AIO-57 — @typescript-eslint/ban-ts-comment](https://linear.app/aios-co/issue/AIO-57/fix-typescript-eslintban-ts-comment-violations-and-restore-default): 10 occurrences across 6 file(s).
- [AIO-58 — @typescript-eslint/no-unsafe-function-type](https://linear.app/aios-co/issue/AIO-58/fix-typescript-eslintno-unsafe-function-type-violations-and-restore): 6 occurrences across 1 file(s).
- [AIO-59 — @typescript-eslint/no-unused-expressions](https://linear.app/aios-co/issue/AIO-59/fix-typescript-eslintno-unused-expressions-violations-and-restore): 5 occurrences across 5 file(s).
- [AIO-60 — no-var](https://linear.app/aios-co/issue/AIO-60/fix-no-var-violations-and-restore-default-eslint-severity): 2 occurrences across 1 file(s).
- [AIO-61 — react-hooks/rules-of-hooks](https://linear.app/aios-co/issue/AIO-61/fix-react-hooksrules-of-hooks-violations-and-restore-default-eslint): 2 occurrences across 2 file(s).
- [AIO-62 — @typescript-eslint/no-empty-object-type](https://linear.app/aios-co/issue/AIO-62/fix-typescript-eslintno-empty-object-type-violations-and-restore): 2 occurrences across 2 file(s).
- [AIO-63 — @typescript-eslint/no-require-imports](https://linear.app/aios-co/issue/AIO-63/fix-typescript-eslintno-require-imports-violations-and-restore-default): 2 occurrences across 1 file(s).
- [AIO-64 — no-irregular-whitespace](https://linear.app/aios-co/issue/AIO-64/fix-no-irregular-whitespace-violations-and-restore-default-eslint): 1 occurrences across 1 file(s).
- [AIO-65 — no-constant-binary-expression](https://linear.app/aios-co/issue/AIO-65/fix-no-constant-binary-expression-violations-and-restore-default): 1 occurrences across 1 file(s).

Parent cleanup: [AIO-26](https://linear.app/aios-co/issue/AIO-26/reduce-the-existing-eslint-and-typescript-error-backlog).
