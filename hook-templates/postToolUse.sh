#!/bin/bash
# Called after any tool completes
# Hook receives JSON via stdin with: tool_name, tool_input, tool_response

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
SUCCESS=$(echo "$INPUT" | jq -r '.tool_response.success // true')

SESSION_DIR=$(find "$(pwd)/.orchestrator" -maxdepth 1 -name "session_*" 2>/dev/null | head -1)
[ -z "$SESSION_DIR" ] && exit 0

TIMESTAMP=$(date +%s%3N)

cat > "$SESSION_DIR/outbox/tool_$TIMESTAMP.json" <<EOF
{
  "type": "tool_complete",
  "tool": "$TOOL_NAME",
  "success": $SUCCESS,
  "timestamp": $TIMESTAMP
}
EOF
