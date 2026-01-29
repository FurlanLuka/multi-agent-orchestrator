#!/bin/bash
# Called when agent finishes/stops
# Hook receives JSON via stdin with session info
#
# NOTE: We intentionally do NOT emit IDLE status here.
# The orchestrator controls project status explicitly:
# - IDLE is set when E2E passes, E2E is disabled, or user skips E2E
# - The agent stopping doesn't mean the project is complete

exit 0
