#!/bin/bash
set -e

REASON="$1"
TIMESTAMP=$(date +%s%3N)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SESSION_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$(dirname "$SESSION_DIR")")"
PROJECT="$(basename "$PROJECT_DIR")"

if [ -z "$REASON" ]; then
  REASON="Restart requested"
fi

cat > "$SESSION_DIR/outbox/restart_$TIMESTAMP.json" <<EOF
{
  "type": "restart_request",
  "project": "$PROJECT",
  "reason": "$REASON",
  "timestamp": $TIMESTAMP
}
EOF

echo "Restart requested: $REASON"
