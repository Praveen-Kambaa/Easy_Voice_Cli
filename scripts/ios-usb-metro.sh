#!/bin/bash
# Forward iPhone localhost:8081 → Mac :8081 so the app can use localhost over USB.
set -e
cd "$(dirname "$0")/.."

if command -v iproxy >/dev/null 2>&1; then
  pkill -f "iproxy 8081 8081" 2>/dev/null || true
  iproxy 8081 8081 &
  echo "USB forwarding: iPhone localhost:8081 → Mac :8081"
  echo "Rebuild/run the app, then Reload JS."
else
  echo "Install USB forwarding: brew install libimobiledevice"
  echo "Then run this script again."
fi

MAC_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "unknown")
echo "Wi‑Fi fallback: on iPhone Safari open http://${MAC_IP}:8081/status (should show packager-status:running)"
echo "Starting Metro on all interfaces…"

exec npx react-native start --host 0.0.0.0
