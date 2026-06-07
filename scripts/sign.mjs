// Shared Authenticode signing helpers for the Windows build.
//
// Signing is OPT-IN via environment variables. If none are set, the build
// produces UNSIGNED binaries (current default behaviour).
//
// Configure ONE certificate source:
//   SIGN_CERT_NAME      Subject name of a cert in your Windows cert store
//                       (works for a self-signed cert installed in the store,
//                       a token cert, or an installed OV/EV cert) -> signtool /n
//   SIGN_CERT_FILE      Path to a .pfx file                                -> signtool /f
//   SIGN_CERT_PASSWORD  Password for the .pfx (optional)                   -> signtool /p
//
// Optional:
//   SIGN_TOOL           Full path to signtool.exe (auto-detected otherwise)
//   SIGN_TIMESTAMP_URL  RFC-3161 timestamp server (default: DigiCert)
//
// For Azure Trusted Signing, set SIGN_TOOL to the signtool that ships with the
// Trusted Signing dlib, or sign separately; this helper covers the common
// store/pfx cases.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const TIMESTAMP_URL = process.env.SIGN_TIMESTAMP_URL || 'http://timestamp.digicert.com';

/** @returns {boolean} true when a signing certificate is configured. */
export function isSigningEnabled() {
  return Boolean(process.env.SIGN_CERT_NAME || process.env.SIGN_CERT_FILE);
}

/** Locates signtool.exe: $SIGN_TOOL, then the newest Windows 10/11 SDK, then PATH. */
export function findSignTool() {
  const fromEnv = process.env.SIGN_TOOL;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const roots = [
    'C:\\Program Files (x86)\\Windows Kits\\10\\bin',
    'C:\\Program Files\\Windows Kits\\10\\bin',
  ];
  const found = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const ver of readdirSync(root)) {
      const candidate = join(root, ver, 'x64', 'signtool.exe');
      if (existsSync(candidate)) found.push(candidate);
    }
  }
  if (found.length) {
    found.sort();
    return found[found.length - 1]; // highest SDK version
  }
  return 'signtool'; // PATH fallback
}

function certArgs() {
  if (process.env.SIGN_CERT_FILE) {
    const args = ['/f', process.env.SIGN_CERT_FILE];
    if (process.env.SIGN_CERT_PASSWORD) args.push('/p', process.env.SIGN_CERT_PASSWORD);
    return args;
  }
  return ['/n', process.env.SIGN_CERT_NAME];
}

/** Signs a single file with signtool (throws on failure). */
export function signFile(file) {
  const tool = findSignTool();
  const args = [
    'sign',
    '/fd', 'SHA256',
    '/tr', TIMESTAMP_URL,
    '/td', 'SHA256',
    ...certArgs(),
    file,
  ];
  console.log(`[sign] signing ${file}`);
  execFileSync(tool, args, { stdio: 'inherit' });
}

/**
 * Builds the command string for Inno Setup's /S<name>= sign-tool definition.
 * Uses $q (Inno's quote token) so paths/names with spaces survive, and $f for
 * the file Inno passes in.
 */
export function innoSignCommand() {
  const tool = findSignTool();
  const q = '$q';
  let cert;
  if (process.env.SIGN_CERT_FILE) {
    cert = `/f ${q}${process.env.SIGN_CERT_FILE}${q}`;
    if (process.env.SIGN_CERT_PASSWORD) cert += ` /p ${process.env.SIGN_CERT_PASSWORD}`;
  } else {
    cert = `/n ${q}${process.env.SIGN_CERT_NAME}${q}`;
  }
  return `${q}${tool}${q} sign /fd SHA256 /tr ${TIMESTAMP_URL} /td SHA256 ${cert} $f`;
}
