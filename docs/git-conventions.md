# Git Conventions

Single source of truth for branch naming and commit/PR title format. Referenced from `CLAUDE.md` and `docs/agents/autonomic-issues.md` instead of restated there.

## Type

Shared across branch names and commit/PR titles below: one of `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `style`, `ci`, `chore`, `revert`.

## Branch naming

`<type>/<issue-identifier>/<description-slug>` — e.g. `fix/AIO-343/optional-graphify` or `feat/AIO-123/group-invites`.

Use this format for both interactive work and the autonomic pipeline. Keep the full Linear issue identifier, including the uppercase team key and number, as its own path segment.

## PR title format

`<type>(<scope>): <subject> [AIO-xx]`

Use the actual Linear issue identifier in brackets, e.g. `feat(groups): add invite notifications [AIO-123]`.

- **Scope**: the module/feature affected (e.g. `groups`, `voting`, `auth`, `filters`, `components`).
- **Subject**: lowercase, imperative mood, no period.
- Keep the part before the issue suffix to about 50 characters.

## Commit message format

`<type>(<scope>): <subject>`

Use the same type, scope, and subject conventions as PR titles. The issue suffix is required for PR titles; commit messages may include it.

See `.claude/skills/create-pr/SKILL.md` for the PR description and verification workflow.
