#!/bin/bash
set -e

ERROR="$1"
SEVERITY="${2:-medium}"
TIMESTAMP=$(date +%s%3N)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SESSION_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$(dirname "$SESSION_DIR")")"
PROJECT="$(basename "$PROJECT_DIR")"

if [ -z "$ERROR" ]; then
  echo "Usage: on_error.sh <error> [severity]" >&2
  echo "Severity: low, medium, high, critical (default: medium)" >&2
  exit 1
fi

# Validate severity
case "$SEVERITY" in
  low|medium|high|critical)
    ;;
  *)
    echo "Invalid severity: $SEVERITY" >&2
    echo "Valid: low, medium, high, critical" >&2
    exit 1
    ;;
esac

cat > "$SESSION_DIR/outbox/error_$TIMESTAMP.json" <<EOF
{
  "type": "error_report",
  "project": "$PROJECT",
  "error": "$ERROR",
  "severity": "$SEVERITY",
  "timestamp": $TIMESTAMP
}
EOF

echo "Error reported: $SEVERITY - $ERROR"
