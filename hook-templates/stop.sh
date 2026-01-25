#!/bin/bash
# Called when agent finishes/stops
# Hook receives JSON via stdin with session info

SESSION_DIR=$(find "$(pwd)/.orchestrator" -maxdepth 1 -name "session_*" 2>/dev/null | head -1)
[ -z "$SESSION_DIR" ] && exit 0

# Get timestamp in milliseconds (works on both macOS and Linux)
if command -v gdate >/dev/null 2>&1; then
  TIMESTAMP=$(gdate +%s%3N)
elif [[ "$OSTYPE" == "darwin"* ]]; then
  TIMESTAMP=$(python3 -c 'import time; print(int(time.time() * 1000))')
else
  TIMESTAMP=$(date +%s%3N)
fi

cat > "$SESSION_DIR/outbox/status_$TIMESTAMP.json" <<EOF
{
  "type": "status",
  "status": "IDLE",
  "timestamp": $TIMESTAMP
}
EOF
