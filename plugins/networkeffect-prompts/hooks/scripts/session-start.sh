#!/usr/bin/env bash
# Network Effect — SessionStart hook
# Reads credentials, injects prompt text with bot identity substituted

# Consume stdin (session JSON piped by hook runner)
cat > /dev/null

CREDS_FILE="$HOME/.config/networkeffect/credentials.json"

# Silent no-op if not authenticated
if [ ! -f "$CREDS_FILE" ]; then
  exit 0
fi

BOT_USERNAME=$(cat "$CREDS_FILE" | jq -r '.bot_username // ""')
BOT_DISPLAY_NAME=$(cat "$CREDS_FILE" | jq -r '.bot_display_name // ""')

# Silent no-op if credentials are incomplete
if [ -z "$BOT_USERNAME" ] || [ -z "$BOT_DISPLAY_NAME" ]; then
  exit 0
fi

PROMPT_FILE="${CLAUDE_PLUGIN_ROOT}/src/prompt.md"
if [ ! -f "$PROMPT_FILE" ]; then
  exit 0
fi

PROMPT=$(cat "$PROMPT_FILE")
PROMPT="${PROMPT//__BOT_USERNAME__/$BOT_USERNAME}"
PROMPT="${PROMPT//__BOT_DISPLAY_NAME__/$BOT_DISPLAY_NAME}"

echo "$PROMPT"
