#!/bin/bash
# Called when agent has notification
# Hook receives JSON via stdin with: message, notification_type

INPUT=$(cat)
MESSAGE=$(echo "$INPUT" | jq -r '.message // empty')
TYPE=$(echo "$INPUT" | jq -r '.notification_type // empty')

# Use ORCHY_SESSION_DIR environment variable (set by orchestrator)
SESSION_DIR="$ORCHY_SESSION_DIR"
[ -z "$SESSION_DIR" ] && exit 0
[ ! -d "$SESSION_DIR/outbox" ] && exit 0

# Get timestamp in milliseconds (works on both macOS and Linux)
if command -v gdate >/dev/null 2>&1; then
  TIMESTAMP=$(gdate +%s%3N)
elif [[ "$OSTYPE" == "darwin"* ]]; then
  TIMESTAMP=$(python3 -c 'import time; print(int(time.time() * 1000))')
else
  TIMESTAMP=$(date +%s%3N)
fi

# Determine status from notification type and message
if [[ "$TYPE" == "permission_prompt" ]]; then
  STATUS="NEEDS_INPUT"
elif [[ "$MESSAGE" =~ [Ee]rror|[Ff]ail ]]; then
  STATUS="ERROR"
else
  STATUS="WORKING"
fi

# Escape message for JSON (handles quotes, newlines, etc.)
MESSAGE_JSON=$(echo "$MESSAGE" | jq -Rs '.' | sed 's/^"//;s/"$//')
TYPE_JSON=$(echo "$TYPE" | jq -Rs '.' | sed 's/^"//;s/"$//')

cat > "$SESSION_DIR/outbox/notification_$TIMESTAMP.json" <<EOF
{
  "type": "notification",
  "status": "$STATUS",
  "message": "$MESSAGE_JSON",
  "notification_type": "$TYPE_JSON",
  "timestamp": $TIMESTAMP
}
EOF
