<#
.SYNOPSIS
  Creates a self-signed Authenticode (code-signing) certificate for Stream Media
  Board and exports it for signing + for trusting on target machines.

.DESCRIPTION
  A self-signed certificate lets you sign the app for FREE. The signature is only
  trusted on machines where you import the public .cer into the trust stores
  (use scripts/trust-cert-on-target.ps1 for that) - perfect for your own PCs and
  family machines, NOT for wide public distribution.

  This script:
    1. Creates a CodeSigning cert in Cert:\CurrentUser\My (so signtool /n finds it
       on THIS build machine).
    2. Exports a password-protected .pfx (private key - keep it safe, never commit).
    3. Exports a public .cer (safe to copy to target machines for trust).

.PARAMETER Subject
  Common name of the certificate. Also the value to use for SIGN_CERT_NAME.

.PARAMETER OutDir
  Folder for the exported .pfx/.cer (default: certs/, which is git-ignored).

.PARAMETER Password
  Password protecting the .pfx. Prompted securely if omitted.

.PARAMETER AutoPassword
  Generate a random password and save it to certs/.pfx-password.txt (non-interactive).

.PARAMETER Years
  Validity in years (default: 5).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\make-selfsigned-cert.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\make-selfsigned-cert.ps1 -Subject "Stream Media Board" -Years 10
#>
[CmdletBinding()]
param(
  [string]$Subject = "Stream Media Board",
  [string]$OutDir = "",
  [System.Security.SecureString]$Password,
  [switch]$AutoPassword,
  [int]$Years = 5
)

$ErrorActionPreference = "Stop"

if (-not $OutDir) {
  $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
  $OutDir = Join-Path $scriptDir "..\certs"
}
$OutDir = [System.IO.Path]::GetFullPath($OutDir)

if ($AutoPassword) {
  $plain = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
  New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
  $passwordFile = Join-Path $OutDir ".pfx-password.txt"
  Set-Content -Path $passwordFile -Value $plain -NoNewline
  $Password = ConvertTo-SecureString $plain -AsPlainText -Force
  Write-Host "[cert] Random password saved to $passwordFile (git-ignored)"
} elseif (-not $Password) {
  $Password = Read-Host -AsSecureString "Choose a password to protect the .pfx (you'll need it to sign)"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Write-Host "[cert] Creating self-signed code-signing certificate 'CN=$Subject'..."
$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject "CN=$Subject" `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -KeyExportPolicy Exportable `
  -KeySpec Signature `
  -KeyAlgorithm RSA `
  -KeyLength 2048 `
  -HashAlgorithm SHA256 `
  -NotAfter (Get-Date).AddYears($Years)

$pfxPath = Join-Path $OutDir "stream-media-board-codesign.pfx"
$cerPath = Join-Path $OutDir "stream-media-board-codesign.cer"

Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $Password | Out-Null
Export-Certificate -Cert $cert -FilePath $cerPath -Type CERT | Out-Null

Write-Host ""
Write-Host "[cert] Done." -ForegroundColor Green
Write-Host "  Thumbprint : $($cert.Thumbprint)"
Write-Host "  PFX (private, keep safe) : $pfxPath"
Write-Host "  CER (public, distribute) : $cerPath"
Write-Host ""
Write-Host "To sign the build on THIS machine (cert is already in your store):" -ForegroundColor Cyan
Write-Host "  `$env:SIGN_CERT_NAME = `"$Subject`""
Write-Host "  node scripts\build-installer-inno.mjs"
Write-Host ""
Write-Host "On each target PC (yours + your wife's), trust the certificate once:" -ForegroundColor Cyan
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\trust-cert-on-target.ps1 -CertPath `"$cerPath`""
