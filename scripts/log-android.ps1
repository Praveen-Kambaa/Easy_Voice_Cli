# Stream logcat for this app only (com.type.easy).
$ErrorActionPreference = "Stop"
$package = "com.type.easy"

$pidOf = (adb shell pidof -s $package 2>$null).Trim()
if (-not $pidOf) {
  Write-Host "App not running ($package). Launch the debug app, then re-run npm run log:android"
  exit 1
}

Write-Host "Logging $package (pid $pidOf). Ctrl+C to stop."
Write-Host "----"

# Clear buffer, then stream only this process + RN JS/native tags.
adb logcat -c | Out-Null
adb logcat --pid=$pidOf *:S ReactNative:V ReactNativeJS:V ReactNativeJNI:V
