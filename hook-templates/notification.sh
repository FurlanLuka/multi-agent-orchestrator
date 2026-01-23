#!/bin/bash
# Called when agent has notification
# Hook receives JSON via stdin with: message, notification_type

INPUT=$(cat)
MESSAGE=$(echo "$INPUT" | jq -r '.message // empty')
TYPE=$(echo "$INPUT" | jq -r '.notification_type // empty')

SESSION_DIR=$(find "$(pwd)/.orchestrator" -maxdepth 1 -name "session_*" 2>/dev/null | head -1)
[ -z "$SESSION_DIR" ] && exit 0

TIMESTAMP=$(date +%s%3N)

# Determine status from notification type and message
if [[ "$TYPE" == "permission_prompt" ]]; then
  STATUS="NEEDS_INPUT"
elif [[ "$MESSAGE" =~ [Ee]rror|[Ff]ail ]]; then
  STATUS="ERROR"
else
  STATUS="WORKING"
fi

cat > "$SESSION_DIR/outbox/notification_$TIMESTAMP.json" <<EOF
{
  "type": "notification",
  "status": "$STATUS",
  "message": "$MESSAGE",
  "notification_type": "$TYPE",
  "timestamp": $TIMESTAMP
}
EOF
