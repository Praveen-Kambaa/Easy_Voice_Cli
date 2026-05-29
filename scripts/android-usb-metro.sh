#!/bin/bash
# USB Android: forward device localhost:8081 → Mac :8081, then start Metro.
set -e
cd "$(dirname "$0")/.."

if command -v adb >/dev/null 2>&1; then
  DEVICES=$(adb devices | awk 'NR>1 && $2=="device" {print $1}')
  if [ -n "$DEVICES" ]; then
    for serial in $DEVICES; do
      adb -s "$serial" reverse tcp:8081 tcp:8081
      echo "USB forwarding ($serial): device localhost:8081 → Mac :8081"
    done
  else
    echo "No authorized Android device — plug in phone and allow USB debugging."
  fi
else
  echo "Install adb (Android SDK platform-tools) for USB forwarding."
fi

MAC_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "unknown")
echo "Wi‑Fi fallback: same network, then in Dev Menu set bundler to http://${MAC_IP}:8081"
echo "Starting Metro on all interfaces…"

exec npx react-native start --host 0.0.0.0
