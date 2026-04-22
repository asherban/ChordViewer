#!/bin/bash
# Checks whether docs/development/ is behind the latest src/ commit.
# Exits 2 (soft block) to prompt Claude to run /architecture-docs when stale.

input=$(cat)

# Don't recurse: if Claude is already handling a stop hook, let it finish.
stop_hook_active=$(echo "$input" | jq -r '.stop_hook_active // false')
if [[ "$stop_hook_active" == "true" ]]; then
  exit 0
fi

# Only run inside a git repository.
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  exit 0
fi

# Timestamp of most recent commit that touched src/.
last_src_ts=$(git log -1 --format=%ct -- src/ 2>/dev/null)
if [[ -z "$last_src_ts" ]]; then
  exit 0  # No src/ commits yet — nothing to document.
fi

# Timestamp of most recent commit that touched docs/development/.
last_docs_ts=$(git log -1 --format=%ct -- docs/development/ 2>/dev/null)
last_docs_ts="${last_docs_ts:-0}"

if [[ "$last_src_ts" -gt "$last_docs_ts" ]]; then
  echo "Architecture docs in docs/development/ are out of date. Please run /architecture-docs to update them, then commit and push before ending the session." >&2
  exit 2
fi

exit 0
