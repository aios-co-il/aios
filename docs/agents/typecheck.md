# Frontend TypeScript gate

Run `pnpm install --frozen-lockfile`, then `pnpm typecheck`. The gate uses the
TypeScript compiler API equivalent of `pnpm exec tsc -p tsconfig.app.json --noEmit`
and checks all frontend sources and their dependencies, including frontend test
files. The frontend enables `strict: true`, including implicit-any and null checks,
with existing strict-mode diagnostics explicitly recorded in the baseline.
It does not check the separate extension or Supabase/Deno functions. Vite
builds remain a separate check. TypeScript is pinned to 5.9.3 in the manifest and
lockfile; CI uses Node 24 and pnpm 9.

`scripts/typecheck-baseline.json` records existing debt as a multiset of relative
file paths, diagnostic codes, full messages, and the diagnostic's source span
(whitespace normalized). Line and column numbers are printed for new errors but
excluded from identity, so moving existing source down a file does not fail.
Absolute checkout paths embedded in messages are made repository-relative, so
the same diagnostics match in local and CI checkouts.
Counts detect additional copies; identity detects replacements even when the
total error count is unchanged. Identical diagnostics on identical source spans
within one file are indistinguishable except by count. A rename, changed message,
or changed offending source requires fixing the error or reviewing the new debt.

New diagnostics fail the gate. Resolved diagnostics also fail until the baseline
is reduced, so allowances cannot silently be reused later. Run
`pnpm typecheck:update` after fixes and commit the reduced baseline alongside
them. This command refuses new errors. No source suppressions or compiler-option
relaxations are required.

Initial capture, exceptional additions, and compiler upgrades use
`pnpm typecheck --accept-new`. Explain the reason and commit the resulting JSON
diff in the PR. Baseline updates and compiler configuration changes do not require
a separate maintainer approval in CI. The TypeScript gate still compares current
diagnostics with the committed baseline and fails on unrecorded errors or stale
allowances. Compiler upgrades need the trusted CI tooling upgraded first.

## Trusted CI execution and rollout

CI checks out the PR's base commit from its target branch (normally `develop`)
separately from the proposed project. It copies the base's checker, policy module,
manifest, and lockfile into an isolated temporary directory and installs that
trusted compiler with dependency hooks disabled. The PR's dependencies are
installed with both lifecycle scripts and pnpm hooks disabled; they are read as
compiler inputs, not imported as checker code. The trusted checker runs with
`--project PATH`, which permits checking only, never updating the candidate
baseline. Compiler upgrades need the trusted tooling upgraded first.

The `baseline-review` job retains its existing check name and validates the PR's
baseline schema using the base's dependency-free `typecheck-policy.mjs`. It reads
the baseline through GitHub's API at the exact head revision and never checks out
or executes PR code. It does not request reviews or compare baseline additions
against the base commit.

Before the target branch contains these tools, CI fails closed unless a full,
reviewed tooling commit SHA is configured as the repository secret
`TYPESCRIPT_GATE_BOOTSTRAP_SHA` (a non-sensitive SHA stored as a secret so its
configuration requires repository administrator access). A maintainer must review that commit's checker,
policy, manifest, and lockfile before configuring it; the PR cannot choose a
bootstrap ref through its files or workflow inputs. Configure the reviewed SHA, then manually rerun the failed jobs.
The configured reviewed SHA explicitly overrides the base's tools; this also
permits a coordinated compiler/tooling upgrade against a reviewed revision.
Once the tools land on `develop`, remove the temporary bootstrap secret and CI
uses the base automatically. Missing trusted tooling never falls back to PR code.

To verify the rollout, open a small follow-up PR against `develop` without changing
the checker, baseline, or compiler settings. Confirm that both `typescript` and
`baseline-review` pass, and that the full frontend TypeScript gate step runs rather
than being skipped. With the bootstrap secret removed, the trusted checkout should
use that PR's base commit.

Separate checkouts do not protect a workflow that a PR can edit or skip. Before
treating this as enforced policy, require the workflow from an independently
protected source through a repository/organization ruleset (where supported), or
an independently controlled check provider. An alternative is branch protection requiring current code-owner approval for
all workflows, trusted checker/policy files, compiler configurations, dependency
manifest/lockfile, and CODEOWNERS itself, with stale approvals dismissed.
Ordinary required check names alone do not prevent a PR from replacing the workflow
implementation; protecting only this workflow also leaves check-name spoofing
through a new workflow possible. Restrict access
to the bootstrap configuration as part of that trust policy. This PR does not
change repository rules or configure the bootstrap secret automatically.

Compiler/configuration failures, missing or malformed baselines, and unexpected
compiler versions fail rather than being treated as zero errors. Run
`pnpm test:typecheck` for focused comparison and real-compiler regression tests.
