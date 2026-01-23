#!/bin/bash
set -e

STATUS="$1"
MESSAGE="$2"
TIMESTAMP=$(date +%s%3N)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SESSION_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$(dirname "$SESSION_DIR")")"
PROJECT="$(basename "$PROJECT_DIR")"

# Validate status
case "$STATUS" in
  IDLE|WORKING|DEBUGGING|FATAL_DEBUGGING|FATAL_RECOVERY|READY|E2E|BLOCKED)
    ;;
  *)
    echo "Invalid status: $STATUS" >&2
    echo "Valid: IDLE, WORKING, DEBUGGING, FATAL_DEBUGGING, FATAL_RECOVERY, READY, E2E, BLOCKED" >&2
    exit 1
    ;;
esac

# Write to outbox
cat > "$SESSION_DIR/outbox/status_$TIMESTAMP.json" <<EOF
{
  "type": "status_update",
  "project": "$PROJECT",
  "status": "$STATUS",
  "message": "$MESSAGE",
  "timestamp": $TIMESTAMP
}
EOF

# Update current status
cat > "$SESSION_DIR/status.json" <<EOF
{
  "status": "$STATUS",
  "message": "$MESSAGE",
  "updated_at": $TIMESTAMP
}
EOF

echo "Status updated: $STATUS"
