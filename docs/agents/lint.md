# Changed-file ESLint gate (AIO-25)

Install with `pnpm install --frozen-lockfile`, fetch the actual target branch,
then run `pnpm lint:changed --base origin/develop` (use `origin/main` for a PR
targeting main). The reference is the merge base with that explicit target; no
branch name is inferred from source files. Local checks include tracked working
tree edits and untracked, non-gitignored files. CI checks the exact PR head and
uses the event's target-branch SHA. Push checks compare against the previous push;
reusable workflow calls and initial pushes fall back to the checked commit's parent.

The target revision is the reviewed reference, so no separate lint baseline can
be enlarged in a PR. The gate lints whole changed files and compares multisets of
error rule IDs, full messages, and offending source spans with whitespace
normalized. Locations are reported but excluded from identity. For rules without
an end location, the normalized source line is used. New files must have zero
errors; existing errors may remain, but additional copies and equal-total
replacements fail. Identical errors on identical spans within a file are
indistinguishable except by count. Fixed debt automatically disappears from the
reference when its fix lands. Renames carry debt from their previous lintable path;
copies are new files. Deletions are skipped. Git output is NUL-delimited and paths
are never interpolated into shell commands.

Warnings remain visible and do not fail the gate. Parser, configuration, missing
reference, unexpected ignored-file, and checker execution failures fail visibly;
parser failures in reference files also fail rather than being accepted as debt.
Inline `eslint-disable`, `eslint` rule settings, and `eslint-env` directives are
ignored in both versions by `allowInlineConfig: false`, so adding suppressions
cannot hide errors. Existing file-level suppressions therefore are not permission
to introduce more errors. No repository rules are weakened or disabled by this gate.

## Scope

`pnpm lint` remains the independent full inventory command. The gate checks
JavaScript/TypeScript paths (`.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.tsx`, `.mts`,
`.cts`, and corresponding JSX/TSX variants). The existing recommended rules apply
to `.ts`/`.tsx` across frontend, Supabase/Deno functions, tests, and extension
sources. It uses no frontend-only exclusion. Deno functions retain the existing
browser globals and syntax-only TypeScript lint configuration; this is not a Deno
type check. The extension does not need Bun dependencies for this syntax-only gate.

The existing flat config does not define substantive JS/MJS/CJS rules; ESLint's
default configuration still parses those files. Extensions without any applicable
configuration, such as `.mts` or `.jsx` today, fail explicitly and require reviewed
configuration before adding them. Non-code paths are outside the lint scope.
Root `dist/`, any `node_modules/`, and Git metadata are the existing generated or
dependency exclusions, reported when encountered. Other ignored lintable files
fail rather than silently escaping checks. Gitignored untracked files are not PR
inputs. New custom exclusions require a reviewed change to gate policy.

## CI trust and rollout

The `eslint` job in `ci-frontend.yml` runs on PRs targeting develop and main and
on branch pushes/reusable calls. It copies checker scripts, the ESLint config,
package manifest, and lockfile from a separate trusted target checkout into a
temporary directory. Dependencies come only from that trusted lockfile, installed
with lifecycle scripts and pnpm hooks disabled. Candidate dependencies and
candidate ESLint modules are never installed or executed by this job. Both old
and new source are linted with the same trusted rules and dependencies. The lockfile
pins the reproducible checker versions; output includes the installed ESLint version.

The first PR needs a reviewed full tooling commit SHA configured by a maintainer
as the repository secret `ESLINT_GATE_BOOTSTRAP_SHA`, following the TypeScript
gate's bootstrap convention. Missing trusted tooling fails closed. The optional
bootstrap SHA overrides the base tools and can also support a coordinated reviewed
rule/dependency upgrade. Review its complete scripts, config, manifest, and
lockfile before configuring it. Remove the bootstrap secret after tools land in
the target branch so future PRs automatically use that target's policy.

Changes to `eslint.config.js`, checker/policy scripts, the package manifest,
lockfile, or pnpm workspace configuration require a maintainer with write access
to approve the exact current PR head. The approval step loads only trusted policy
and reads proposed files via GitHub's API. It does not execute PR code. This also
requires explicit review for new ignores, disabled rules, or dependency changes;
there is no accept-new baseline option. New source errors still fail regardless
of approval. Rules/configuration upgrades should first be checked through the
reviewed bootstrap tooling. A new commit invalidates approval; approve then rerun
the original PR workflow if the review event does not refresh required checks.
Approval does not authorize merging or deploying.

As with the TypeScript gate, enforce the workflow through an independently
protected ruleset/check provider or require code-owner review with stale approvals
dismissed for all workflows, gate tooling, configuration, dependency files, and
CODEOWNERS itself. Required check names alone cannot prevent replacing/skipping a
workflow or spoofing its name through another workflow. Repository protection and
bootstrap configuration are rollout steps; this change does not set them.

Run `pnpm test:lint` for real ESLint/Git regression tests. After rollout, verify a
clean PR passes, a new `.ts` file with an explicit `any` fails, and a changed file
with unchanged debt and shifted lines passes; repeat for each protected target.
