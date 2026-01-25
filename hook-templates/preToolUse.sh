#!/bin/bash
# Called before any tool runs
# Hook receives JSON via stdin with: tool_name, tool_input

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input // empty')

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

PROJECT_ROOT=$(pwd)

# Function to check if a path is within the project
is_within_project() {
  local target_path="$1"

  # Skip empty paths
  [ -z "$target_path" ] && return 0

  # Expand ~ to home directory
  target_path="${target_path/#\~/$HOME}"

  # Convert to absolute path
  if [[ "$target_path" != /* ]]; then
    target_path="$PROJECT_ROOT/$target_path"
  fi

  # Resolve to canonical path (handles .., symlinks, etc.)
  # Use python for cross-platform compatibility
  local resolved_path=$(python3 -c "import os; print(os.path.normpath('$target_path'))" 2>/dev/null)
  [ -z "$resolved_path" ] && return 0

  # Check if path starts with project root
  if [[ "$resolved_path" == "$PROJECT_ROOT"* ]] || [[ "$resolved_path" == "$PROJECT_ROOT" ]]; then
    return 0  # Within project
  fi

  # Allow access to common system paths and temp directories
  if [[ "$resolved_path" == /tmp/* ]] || \
     [[ "$resolved_path" == /private/tmp/* ]] || \
     [[ "$resolved_path" == /var/folders/* ]] || \
     [[ "$resolved_path" == /dev/* ]]; then
    return 0
  fi

  return 1  # Outside project
}

# Extract file path based on tool type
get_target_path() {
  case "$TOOL_NAME" in
    Write|Read|Edit|NotebookEdit)
      echo "$TOOL_INPUT" | jq -r '.file_path // .notebook_path // empty'
      ;;
    Glob|Grep)
      echo "$TOOL_INPUT" | jq -r '.path // empty'
      ;;
    *)
      echo ""
      ;;
  esac
}

# Check file operation tools for cross-project access
TARGET_PATH=$(get_target_path)
BLOCKED=""
BLOCKED_PATH=""

if [ -n "$TARGET_PATH" ]; then
  if ! is_within_project "$TARGET_PATH"; then
    BLOCKED="true"
    BLOCKED_PATH="$TARGET_PATH"
  fi
fi

# If blocked, emit event and reject the tool
if [ "$BLOCKED" = "true" ]; then
  # Escape path for JSON
  BLOCKED_PATH_JSON=$(echo "$BLOCKED_PATH" | jq -Rs '.' | sed 's/^"//;s/"$//')

  cat > "$SESSION_DIR/outbox/blocked_$TIMESTAMP.json" <<EOF
{
  "type": "cross_project_blocked",
  "tool": "$TOOL_NAME",
  "target_path": "$BLOCKED_PATH_JSON",
  "project_root": "$PROJECT_ROOT",
  "timestamp": $TIMESTAMP,
  "message": "Detected attempt to access path outside project. If this file is in another project, report the issue to the orchestrator instead of modifying it directly."
}
EOF

  # Return error message to the agent
  echo "BLOCKED: You are trying to access '$BLOCKED_PATH' which is outside your project directory ($PROJECT_ROOT)."
  echo ""
  echo "As an agent for this specific project, you must NOT modify files in other projects."
  echo ""
  echo "If you believe the issue originates from another project, include this in your task completion response:"
  echo "- Describe what you found"
  echo "- Identify which other project might need changes"
  echo "- Explain what changes might be needed there"
  echo ""
  echo "The orchestrator will route this information appropriately."

  exit 2  # Non-zero exit blocks the tool
fi

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
