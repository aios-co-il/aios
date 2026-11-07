#!/usr/bin/env bash
# Posts a reply to a single PR review thread. The reply body is read from stdin.
# Usage: reply-thread.sh <thread-id> <<< "body"
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: reply-thread.sh <thread-id> (body on stdin)" >&2
  exit 1
fi

thread_id="$1"
body="$(cat)"

gh api graphql -f query='
  mutation($threadId: ID!, $body: String!) {
    addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: $threadId, body: $body}) {
      comment { id }
    }
  }' -F threadId="$thread_id" -f body="$body" >/dev/null
