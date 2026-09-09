# Pretty log stream for this app only (com.type.easy).
# Multiple devices: prefers ANDROID_SERIAL, else physical phone, else first device.
$ErrorActionPreference = "Stop"
$package = "com.type.easy"

function Get-AdbSerial {
  if ($env:ANDROID_SERIAL -and $env:ANDROID_SERIAL.Trim()) {
    return $env:ANDROID_SERIAL.Trim()
  }

  $lines = adb devices | Select-Object -Skip 1 | Where-Object { $_ -match "\tdevice$" }
  $serials = @()
  foreach ($line in $lines) {
    $serials += ($line -split "\s+")[0]
  }

  if ($serials.Count -eq 0) {
    Write-Host "No authorized Android device. Plug in a phone or start an emulator."
    exit 1
  }

  if ($serials.Count -eq 1) {
    return $serials[0]
  }

  $physical = $serials | Where-Object { $_ -notmatch "^emulator-" } | Select-Object -First 1
  if ($physical) {
    Write-Host "Multiple devices found - using physical: $physical"
    Write-Host 'Override example: $env:ANDROID_SERIAL="emulator-5554"; npm run log:android'
    return $physical
  }

  Write-Host "Multiple devices found - using: $($serials[0])"
  return $serials[0]
}

$serial = Get-AdbSerial
$pidOf = (adb -s $serial shell pidof -s $package 2>$null)
if ($pidOf) { $pidOf = $pidOf.ToString().Trim() }

if (-not $pidOf) {
  Write-Host "App not running on $serial ($package)."
  Write-Host "Launch the debug app on that device, then re-run npm run log:android"
  exit 1
}

Write-Host ""
Write-Host "  Easy Voice logs  |  $package  |  $serial  |  pid $pidOf"
Write-Host "  Ctrl+C to stop"
Write-Host ""

adb -s $serial logcat -c | Out-Null
adb -s $serial logcat --pid=$pidOf -v raw *:S ReactNativeJS:V
