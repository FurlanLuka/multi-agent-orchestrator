#!/bin/bash
set -e

PROMPT="$1"
TYPE="${2:-approval}"
TIMESTAMP=$(date +%s%3N)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SESSION_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$(dirname "$SESSION_DIR")")"
PROJECT="$(basename "$PROJECT_DIR")"
REQUEST_ID="${PROJECT}_req_$TIMESTAMP"

if [ -z "$PROMPT" ]; then
  echo "Usage: on_question.sh <prompt> [type]" >&2
  echo "Type: approval, confirmation, input (default: approval)" >&2
  exit 1
fi

# Ensure response directory exists
mkdir -p /tmp/orchestrator/approval_queue/responses

cat > "$SESSION_DIR/outbox/approval_$TIMESTAMP.json" <<EOF
{
  "type": "approval_request",
  "id": "$REQUEST_ID",
  "project": "$PROJECT",
  "prompt": "$PROMPT",
  "approval_type": "$TYPE",
  "timestamp": $TIMESTAMP
}
EOF

# Wait for response
RESPONSE_FILE="/tmp/orchestrator/approval_queue/responses/$REQUEST_ID.json"
echo "Waiting for approval... (request: $REQUEST_ID)"

while [ ! -f "$RESPONSE_FILE" ]; do
  sleep 1
done

# Parse response
APPROVED=$(cat "$RESPONSE_FILE" | grep -o '"approved":[^,}]*' | cut -d: -f2 | tr -d ' ')

# Clean up response file
rm -f "$RESPONSE_FILE"

if [ "$APPROVED" = "true" ]; then
  echo "Approved"
  exit 0
else
  echo "Rejected"
  exit 1
fi
