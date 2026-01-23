#!/bin/bash
# Called before any tool runs
# Hook receives JSON via stdin with: tool_name, tool_input

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

SESSION_DIR=$(find "$(pwd)/.orchestrator" -maxdepth 1 -name "session_*" 2>/dev/null | head -1)
[ -z "$SESSION_DIR" ] && exit 0

TIMESTAMP=$(date +%s%3N)

# Log tool execution start
cat > "$SESSION_DIR/outbox/pretool_$TIMESTAMP.json" <<EOF
{
  "type": "tool_start",
  "tool": "$TOOL_NAME",
  "timestamp": $TIMESTAMP
}
EOF

# Exit 0 to allow tool to proceed
exit 0
