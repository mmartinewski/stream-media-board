# Diagnose a packaged Stream Media Board install (run on the machine that fails).
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\diagnose-installed.ps1
# Or from an installed copy (adjust $InstallDir if needed):
#   powershell -ExecutionPolicy Bypass -File "%LOCALAPPDATA%\Programs\StreamMediaBoard\...\diagnose-installed.ps1"

$ErrorActionPreference = "Continue"
$InstallDir = "$env:LOCALAPPDATA\Programs\StreamMediaBoard"
$AppDataDir = "$env:APPDATA\LocalSoundboardServer"
$LogsDir = Join-Path $AppDataDir "logs"
$Port = 3847

Write-Host "=== Stream Media Board diagnostics ===" -ForegroundColor Cyan
Write-Host "Install:  $InstallDir"
Write-Host "App data: $AppDataDir"
Write-Host ""

function Test-PathMsg($label, $path) {
  if (Test-Path $path) { Write-Host "[OK]   $label : $path" -ForegroundColor Green }
  else { Write-Host "[MISS] $label : $path" -ForegroundColor Red }
}

Test-PathMsg "Shell exe" (Join-Path $InstallDir "StreamMediaBoard.exe")
Test-PathMsg "node.exe" (Join-Path $InstallDir "runtime\node.exe")
Test-PathMsg "Backend entry" (Join-Path $InstallDir "app\backend\dist\index.js")
Test-PathMsg "better_sqlite3.node" (Join-Path $InstallDir "app\node_modules\better-sqlite3\build\Release\better_sqlite3.node")

Write-Host ""
Write-Host "--- Port $Port ---" -ForegroundColor Cyan
$listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listeners) {
  Write-Host "[BUSY] Port $Port is in use:" -ForegroundColor Yellow
  $listeners | ForEach-Object {
    $proc = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    Write-Host "  PID $($_.OwningProcess) $($proc.ProcessName)"
  }
} else {
  Write-Host "[OK]   Port $Port is free" -ForegroundColor Green
}

Write-Host ""
Write-Host "--- Try starting backend (10s) ---" -ForegroundColor Cyan
$node = Join-Path $InstallDir "runtime\node.exe"
$entry = Join-Path $InstallDir "app\backend\dist\index.js"
if ((Test-Path $node) -and (Test-Path $entry)) {
  $env:PERSONAL_CLIP_PLAYER_ROOT = Join-Path $InstallDir "app"
  $env:NODE_BINARY = $node
  $p = Start-Process -FilePath $node -ArgumentList "`"$entry`"" -WorkingDirectory $InstallDir -PassThru -NoNewWindow -RedirectStandardOutput (Join-Path $LogsDir "_diag-stdout.txt") -RedirectStandardError (Join-Path $LogsDir "_diag-stderr.txt")
  Start-Sleep -Seconds 8
  if (-not $p.HasExited) {
    try {
      $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 3
      Write-Host "[OK]   Health: $($r.Content)" -ForegroundColor Green
    } catch {
      Write-Host "[FAIL] Backend running but health check failed: $_" -ForegroundColor Red
    }
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  } else {
    Write-Host "[FAIL] Backend exited early (code $($p.ExitCode)). Antivirus may have blocked node.exe." -ForegroundColor Red
    $stderr = Join-Path $LogsDir "_diag-stderr.txt"
    if (Test-Path $stderr) { Get-Content $stderr -Tail 30 }
  }
} else {
  Write-Host "[SKIP] node or backend entry missing" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "--- Log files ---" -ForegroundColor Cyan
foreach ($f in @("latest.log", "shell-backend.log", "shell.log")) {
  $p = Join-Path $LogsDir $f
  if (Test-Path $p) {
    Write-Host "--- $f (last 15 lines) ---"
    Get-Content $p -Tail 15
  } else {
    Write-Host "[none] $p"
  }
}

Write-Host ""
Write-Host "Kaspersky: exclude BOTH install dir AND $AppDataDir" -ForegroundColor Yellow
Write-Host "Also check Quarantine for node.exe or better_sqlite3.node"
