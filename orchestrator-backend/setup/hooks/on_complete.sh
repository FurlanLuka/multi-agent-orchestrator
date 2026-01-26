#!/bin/bash
set -e

SUMMARY="$1"
TIMESTAMP=$(date +%s%3N)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SESSION_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$(dirname "$SESSION_DIR")")"
PROJECT="$(basename "$PROJECT_DIR")"

if [ -z "$SUMMARY" ]; then
  echo "Usage: on_complete.sh <summary>" >&2
  exit 1
fi

cat > "$SESSION_DIR/outbox/complete_$TIMESTAMP.json" <<EOF
{
  "type": "task_complete",
  "project": "$PROJECT",
  "summary": "$SUMMARY",
  "timestamp": $TIMESTAMP
}
EOF

# Also update status to READY
"$SCRIPT_DIR/on_status_change.sh" "READY" "$SUMMARY"
