#!/bin/bash
# Called when agent finishes/stops
# Hook receives JSON via stdin with session info

SESSION_DIR=$(find "$(pwd)/.orchestrator" -maxdepth 1 -name "session_*" 2>/dev/null | head -1)
[ -z "$SESSION_DIR" ] && exit 0

TIMESTAMP=$(date +%s%3N)

cat > "$SESSION_DIR/outbox/status_$TIMESTAMP.json" <<EOF
{
  "type": "status",
  "status": "IDLE",
  "timestamp": $TIMESTAMP
}
EOF
