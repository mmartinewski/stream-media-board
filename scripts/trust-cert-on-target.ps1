<#
.SYNOPSIS
  Trusts the Stream Media Board self-signed code-signing certificate on a target
  machine so the signed app/installer is recognized as signed + trusted.

.DESCRIPTION
  Imports the PUBLIC .cer (never the .pfx) into:
    - Trusted Root Certification Authorities  -> the signature chain validates
    - Trusted Publishers                      -> no "Unknown Publisher" prompt

  Run this ONCE on each machine that will run the app (your PC, your wife's PC).
  LocalMachine scope (default) trusts the cert for all users and is what AV /
  SmartScreen check - it requires running this script "as Administrator".

.PARAMETER CertPath
  Path to the public .cer exported by make-selfsigned-cert.ps1.

.PARAMETER Scope
  LocalMachine (default, needs admin) or CurrentUser.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\trust-cert-on-target.ps1 -CertPath certs\stream-media-board-codesign.cer

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\trust-cert-on-target.ps1 -CertPath C:\tmp\cert.cer -Scope CurrentUser
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$CertPath,
  [ValidateSet("LocalMachine", "CurrentUser")]
  [string]$Scope = "LocalMachine"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $CertPath)) {
  throw "Certificate file not found: $CertPath"
}

if ($Scope -eq "LocalMachine") {
  $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
    ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) {
    throw "LocalMachine scope requires Administrator. Right-click PowerShell -> 'Run as administrator', or use -Scope CurrentUser."
  }
}

$rootStore = "Cert:\$Scope\Root"
$pubStore = "Cert:\$Scope\TrustedPublisher"

Write-Host "[trust] Importing $CertPath into $Scope Root + TrustedPublisher..."
Import-Certificate -FilePath $CertPath -CertStoreLocation $rootStore | Out-Null
Import-Certificate -FilePath $CertPath -CertStoreLocation $pubStore | Out-Null

Write-Host "[trust] Done. The signed app/installer is now trusted on this machine ($Scope)." -ForegroundColor Green
