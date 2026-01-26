#!/bin/bash
# Called when a subagent (Task tool) finishes
# Hook receives JSON via stdin

INPUT=$(cat)

SESSION_DIR=$(find "$(pwd)/.aio" -maxdepth 1 -name "session_*" 2>/dev/null | head -1)
[ -z "$SESSION_DIR" ] && exit 0

# Get timestamp in milliseconds (works on both macOS and Linux)
if command -v gdate >/dev/null 2>&1; then
  TIMESTAMP=$(gdate +%s%3N)
elif [[ "$OSTYPE" == "darwin"* ]]; then
  TIMESTAMP=$(python3 -c 'import time; print(int(time.time() * 1000))')
else
  TIMESTAMP=$(date +%s%3N)
fi

cat > "$SESSION_DIR/outbox/subagent_$TIMESTAMP.json" <<EOF
{
  "type": "subagent_stop",
  "timestamp": $TIMESTAMP
}
EOF
