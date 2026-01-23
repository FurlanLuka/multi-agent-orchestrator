#!/bin/bash
set -e

TARGET="$1"
MESSAGE="$2"
TIMESTAMP=$(date +%s%3N)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SESSION_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$(dirname "$SESSION_DIR")")"
PROJECT="$(basename "$PROJECT_DIR")"

if [ -z "$TARGET" ] || [ -z "$MESSAGE" ]; then
  echo "Usage: send_message.sh <target_project> <message>" >&2
  exit 1
fi

cat > "$SESSION_DIR/outbox/message_$TIMESTAMP.json" <<EOF
{
  "type": "message",
  "from": "$PROJECT",
  "to": "$TARGET",
  "message": "$MESSAGE",
  "timestamp": $TIMESTAMP
}
EOF

echo "Message sent to $TARGET"
