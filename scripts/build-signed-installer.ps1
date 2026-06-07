# Builds the Inno installer with the self-signed cert (SIGN_CERT_NAME).
$ErrorActionPreference = "Stop"
$env:SIGN_CERT_NAME = "Stream Media Board"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
node scripts\build-installer-inno.mjs @args
