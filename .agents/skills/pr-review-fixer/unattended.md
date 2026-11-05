# Unattended mode

Reached from `SKILL.md` only when the skill is invoked with `unattended` (a
long-running agent, no human to answer Phase 3's question). Skip this file
otherwise.

Run Phases 1 and 2 as written. Then replace Phases 3 and 4 with the loop below.
Never stop to ask: the verdict decides.

## Decide

Each comment gets exactly one decision, taken from its verdict and size:

- **Fix**: verdict Needed and size `small` or `medium`. Implement it, then resolve
  the thread as in Phase 4.
- **Ticket**: verdict Needed and size `large`, or Pre-existing with a Needed failure.
  Create a ticket (below), then reply on the thread with the ticket link. Leave the
  thread unresolved.
- **Skip**: verdict Optional, False positive, or Pre-existing without a failure.
  Reply on the thread. Leave it unresolved.
- **Question**: reply with the answer and resolve the thread.

Only the fixes this skill proposes get made. A comment the reviewer insists on but
the verdict skips stays skipped; the reply records why.

## Reply

Every thread that is not fixed gets one reply stating the decision and a short
explanation: the decision word (Skipped, Ticketed), then one or two sentences
naming the evidence (the code you read, the command you ran, how often the failure
can occur here). Add the ticket link when there is one.

`gh` available: `${CLAUDE_SKILL_DIR}/scripts/reply-thread.sh <thread-id>` with the
body on stdin. `gh` missing: [`gh-missing.md`](./gh-missing.md)'s "Phase 4" section.
Top-level review bodies and issue comments have no thread: answer them in one
`gh pr comment` listing their decisions, headed by the marker `summary`.

Replies are unconditional here: nobody is waiting to ask for one, in either path.

## Marker

A resumed run must not repeat itself, so every reply, ticket body, and summary
comment carries the marker `<!-- pr-review-fixer:<id> -->`, where `<id>` is the
thread id (or `summary`). The fetch output already holds every comment body, so:

- Skip a thread whose comments already contain its marker: it was decided.
- Skip the summary comment when an issue comment already contains the `summary` marker.
- Before creating a ticket, run `gh issue list --state all --search "pr-review-fixer:<id> in:body"`
  and reuse the ticket found.

## Ticket

One ticket per distinct bug. Use the repo's tracker (the one its `CLAUDE.md` or
`AGENTS.md` names); with none named, `gh issue create`; `gh` missing, `mcp__github__issue_write`. With no
ticket tool at all, put the full bug description in the thread reply and say in the
summary that it needs a ticket. Title states the failure,
body carries the failing input or state, the file and line, the PR link, and the
reviewer's quote. Never ticket a comment you fixed in this PR.

## Finish

End with one summary: fixed, ticketed (with links), skipped, each by comment number.
