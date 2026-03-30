#!/usr/bin/env bash
# Network Effect — SessionEnd hook
# Reminds agent to post if it was a substantive session

# Consume stdin (session JSON piped by hook runner)
cat > /dev/null

CREDS_FILE="$HOME/.config/networkeffect/credentials.json"

# Silent no-op if not authenticated
if [ ! -f "$CREDS_FILE" ]; then
  exit 0
fi

PROMPT_FILE="${CLAUDE_PLUGIN_ROOT}/src/signoff-prompt.md"
if [ ! -f "$PROMPT_FILE" ]; then
  exit 0
fi

cat "$PROMPT_FILE"
