---
name: aio-26-backlog
description: Claim one small slice of the AIO-26 ESLint and TypeScript backlog, fix it, and open one reviewable PR. Pass a number to run that many parallel agents, one PR each.
argument-hint: "[N parallel agents, default 1]"
disable-model-invocation: true
---

# AIO-26 backlog slice

Work AIO-26 (reduce the ESLint and TypeScript backlog): claim one **slice**, fix it, open one PR. `$ARGUMENTS` is the number of parallel agents; empty or `1` means you do the work yourself.

Before the first edit, before each push, and when reviewing code: read `CODING_STANDARDS.md` in full and apply it.

The CI gates already exist (AIO-24 TypeScript diagnostic baseline, AIO-25 ESLint with temporary per-rule warnings). A slice lowers that baseline or restores a rule to error severity.

`pnpm typecheck` understates the type backlog: it checks only `src/`, leaves `noUnusedLocals` and `noUnusedParameters` off, and counts `any` as typed. Measure a TypeScript slice with its own flag or rule, before and after, as well as with `pnpm typecheck`.

A **slice** is one rule or root cause in one directory or feature, at most ~15 files or ~100 changed lines, so a reviewer can verify it by reading the diff.

## 1. Claim

1. Remeasure lint and typecheck on fresh `origin/develop`. Counts in the issues are history.
2. List every sub-issue of AIO-26 and the children of each (for example AIO-52's AIO-86 to AIO-92) with status, assignee, and linked PR. Search Linear issues and open PRs by the rule name too, since some rules live outside AIO-26 (for example AIO-258 covers `curly`, `func-style`, `no-non-null-assertion`). A slice is **taken** when any of these holds:
   - its issue or one of its children is In Progress, In Review, or assigned to someone else (for example AIO-52, `no-explicit-any`, Stas). A parent issue that only groups work, such as AIO-258 in Backlog with no assignee or PR, does not take a slice;
   - an open PR, remote branch, or merged commit already covers the same rule and files;
   - it needs a runtime bug fix (AIO-19: agent mood/voice `tenantId`) or test-infrastructure repair (AIO-21: missing test dependencies, broken test imports), because other issues own those.
3. Pick untaken slices. Cut oversized rules (`no-explicit-any`, `DynamicTableView`, broadcast hooks) down to one directory or file. With N > 1, pick N slices that share no files and no rule within one directory.
4. **Claim** each one: use the matching Backlog/Todo sub-issue, or create one under AIO-26 (search first for duplicates). Assign it to yourself, set it In Progress, and comment the rule, file list, and before-count. Then re-list the sub-issues. If an overlapping claim appeared, release yours and pick again.

Done when every chosen sub-issue is In Progress with your comment, and no other sub-issue or PR overlaps its files. If every slice is taken, report that and stop.

## 2. Dispatch (N > 1 only)

Start one agent per claimed slice with `isolation: "worktree"`, branched from fresh `develop`. Each brief contains: the `CODING_STANDARDS.md` line, the gates paragraph, steps 3-5 below, its sub-issue, and its exact file list. Each agent opens its own PR. Done when every agent has reported; confirm no two PRs touch the same file, report the PR links with before/after counts, and stop.

## 3. Fix

Fix the cause: real types, runtime validation where data is untrusted, schema checked before touching generated Supabase types. Behavior stays identical; add a focused test only where runtime logic changes. Touch only the slice's files. Suppressions, casts, and rule-disables hide the cause, so each fix removes the diagnostic at its source. Lower the TypeScript baseline for the diagnostics you fixed. When your PR clears a rule's last occurrence, restore that rule's default severity in `eslint.config.js`.

Done when every diagnostic in your file list is gone and the baseline reflects it.

## 4. Verify

Run lint, typecheck, relevant tests, and build. Record before/after for the slice and for the whole repo. If a failing test traces to AIO-21 test infrastructure, note it in the PR and leave it.

Done when the slice is **green**, the whole-repo count is lower, and nothing new is **red**.

## 5. Hand off

Open one PR to `develop` from the Linear branch name, titled `fix(eslint): <what> [AIO-xxx]` (`fix(types):` for TypeScript slices). The body states: the slice and why it was chosen, before/after counts, how to review (for example "mechanical, same change in every file"), and the verification run. Set the sub-issue to In Review, link the PR, leave AIO-26 open, and stop at the PR link.

Report in at most 5 lines: slice, PR link, before/after, anything skipped and why.
