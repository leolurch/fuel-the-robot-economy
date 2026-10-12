#!/usr/bin/env sh
# Fails if any commit in the range names Cursor as author, committer, or in a trailer
# (Co-authored-by, Made-with, ...). Usage: scripts/check-authorship.sh [rev-range]
set -eu

range="${1:-HEAD}"

idents=$(git log --format='%h  author: %an <%ae>  committer: %cn <%ce>' "$range" | grep -i 'cursor' || true)
trailers=$(git log --format='%h  %(trailers:unfold,separator=%x20|%x20)' "$range" | grep -i 'cursor' || true)

if [ -n "$idents$trailers" ]; then
  echo "Commits that credit Cursor:" >&2
  [ -n "$idents" ] && echo "$idents" >&2
  [ -n "$trailers" ] && echo "$trailers" >&2
  echo "Rewrite them with your own name and email before pushing." >&2
  exit 1
fi

echo "authorship ok: $(git rev-list --count "$range") commits checked"
