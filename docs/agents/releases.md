# Pull request and release procedure

Follow the merge and production approval rules in root `AGENTS.md`.

- Before opening or updating a PR, fetch its base with `git fetch origin <base>` and merge/rebase so HEAD contains the latest base. Keep the up-to-date check green and never merge a stale branch.
- `develop` merges through a merge queue (squash). The queue rebuilds each PR on top of `develop` and the PRs ahead of it and runs CI on the `merge_group` event; a PR that conflicts or fails CI leaves the queue and the rest continue. Before David queues a PR, it has no conflict with `develop` and its CI is green. A CI job that the ruleset requires must run on `merge_group`, or the queue waits for it forever.
- Feature and hotfix work never merges between `main` and `develop`; only the release merge commit below joins them. Hotfix: PR to `main` (rebase-merge), then a second PR cherry-picking the same commit onto `develop`. The `Check develop has main` run on each `main` push fails until that port lands. See `docs/ENVIRONMENTS.md`.
- After each completed branch change and follow-up push, send David the Vercel Preview URL and in-app path when known. For `develop`, use the stable alias `https://after-lead-git-develop-aios-crm.vercel.app`; include the custom domain only after the verification described in `docs/ENVIRONMENTS.md`.
- Tenant pages require `/t/<tenant-slug-or-id>/…`; bare routes such as `/signatures` 404. Public routes such as `/sign/:token` are the exception.
- Each agent sends its own preview; nobody merges on another agent's behalf.
- For edge-function changes, also follow `docs/agents/development.md` for deployment verification.
- Before applying `safe-bugfix` or assessing auto-merge eligibility, read `.github/workflows/auto-merge-safe-bugfix.yml` and verify every enforced condition: branch pattern, target branch, label, file and line limits, blocked paths, successful build at the current PR head, and base freshness. The workflow is the source of truth for these criteria. Apply the label only after an explicit merge request and the production approval required in `AGENTS.md`. See `docs/postmortems/2026-09-01-clients-dialog-import.md` for context.

## Releasing (product owner)

- **Start a release:** Actions → `Release` → Run workflow on `develop`; pick the bump (`patch`, `minor`, `major`) and an optional note. The run checks that `develop` has something to ship, every `main` commit has an equivalent on `develop`, and CI on the `develop` commit is green. It then opens the `develop` → `main` PR with a changelog and waits for the `Production` environment reviewers.
- **Dry run:** tick `dry_run` to run every check and print the changelog without the release app, a PR, a merge, a tag or a release. Use it for the first run after setup.
- **Approval:** the `Production` environment's required reviewers are the Production approval. After they approve, the workflow merges the PR with a merge commit, tags `vX.Y.Z` and publishes a GitHub Release; Supabase and Vercel deploy Production from the `main` push. Agents never approve the run.
- **Merge method:** a merge commit made by the release GitHub App, which bypasses the `main` ruleset. Squash would turn `Check develop has main` red for good, because one squashed patch has no per-commit equivalent on `develop`.
- **Blocked release:** when a hotfix on `main` is missing from `develop`, the run fails and prints a prompt in its summary. Give that prompt to your coding agent. It opens the backport PR to `develop` and stops; a human queues it, then run the release again.
- **One-time setup (admin):** create a GitHub App with Contents, Pull requests and Checks write access, add it as a bypass actor on the `main` ruleset, store `RELEASE_APP_ID` and `RELEASE_APP_PRIVATE_KEY` as repository secrets, and add required reviewers to the `Production` environment. The workflow refuses to merge while the environment has no reviewers.
