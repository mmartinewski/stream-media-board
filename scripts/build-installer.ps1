$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

Write-Host "[installer] Installing dependencies..."
npm install

Write-Host "[installer] Fetching runtime binaries..."
npm run fetch:bin
npm run fetch:node

Write-Host "[installer] Building Windows installer (Inno Setup)..."
node scripts\build-installer-inno.mjs

Write-Host "[installer] Done. Check installer/Output/ for the generated installer."
