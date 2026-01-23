#!/bin/bash
# Called when a subagent (Task tool) finishes
# Hook receives JSON via stdin

INPUT=$(cat)

SESSION_DIR=$(find "$(pwd)/.orchestrator" -maxdepth 1 -name "session_*" 2>/dev/null | head -1)
[ -z "$SESSION_DIR" ] && exit 0

TIMESTAMP=$(date +%s%3N)

cat > "$SESSION_DIR/outbox/subagent_$TIMESTAMP.json" <<EOF
{
  "type": "subagent_stop",
  "timestamp": $TIMESTAMP
}
EOF
