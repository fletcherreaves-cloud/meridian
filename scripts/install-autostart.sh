#!/bin/zsh
# Installs the Meridian dev server as a macOS Login Item (LaunchAgent).
# Vite will start automatically on login and restart itself if it crashes.
# Run once: bash scripts/install-autostart.sh

PLIST_SRC="$(cd "$(dirname "$0")" && pwd)/com.meridian.dev.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/com.meridian.dev.plist"

cp "$PLIST_SRC" "$PLIST_DEST"
launchctl unload "$PLIST_DEST" 2>/dev/null
launchctl load "$PLIST_DEST"

echo "✓ Meridian dev server registered as a Login Agent."
echo "  Vite will start automatically at login and restart on crash."
echo "  App: http://localhost:5173"
echo ""
echo "  To stop:   launchctl unload ~/Library/LaunchAgents/com.meridian.dev.plist"
echo "  To remove: rm ~/Library/LaunchAgents/com.meridian.dev.plist"
echo "  Logs:      tail -f /tmp/meridian-dev.log"
