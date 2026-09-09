# USB Android (Windows): forward device localhost:8081 → PC :8081, then start Metro.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

function Ensure-AdbReverse {
  $adb = Get-Command adb -ErrorAction SilentlyContinue
  if (-not $adb) {
    Write-Host "Install adb (Android SDK platform-tools) and add it to PATH."
    return
  }

  $devices = adb devices | Select-Object -Skip 1 | Where-Object { $_ -match "\tdevice$" } | ForEach-Object {
    ($_ -split "\s+")[0]
  }

  if (-not $devices) {
    Write-Host "No authorized Android device — plug in phone and allow USB debugging."
    return
  }

  foreach ($serial in $devices) {
    adb -s $serial reverse tcp:8081 tcp:8081 | Out-Null
    Write-Host "USB forwarding ($serial): device localhost:8081 → PC :8081"
  }
}

Ensure-AdbReverse

$ipv4 = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } |
  Select-Object -ExpandProperty IPAddress -First 1
if (-not $ipv4) { $ipv4 = "YOUR_PC_IP" }

Write-Host "Wi-Fi fallback: same network, then in Dev Menu set bundler to http://${ipv4}:8081"
Write-Host "Starting Metro on 0.0.0.0:8081 (kill other Metro/Expo on 8081-8083 first if needed)..."

npx react-native start --host 0.0.0.0 --port 8081
