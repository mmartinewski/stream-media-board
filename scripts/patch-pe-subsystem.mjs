#!/usr/bin/env node
/**
 * Patch a Windows PE executable from CONSOLE (3) to WINDOWS (2) subsystem.
 * Workaround when go build -H=windowsgui is blocked by AV on the linker temp exe.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const IMAGE_SUBSYSTEM_WINDOWS_GUI = 2;
const IMAGE_SUBSYSTEM_WINDOWS_CUI = 3;

const file = process.argv[2];
if (!file) {
  console.error('Usage: node patch-pe-subsystem.mjs <path-to.exe>');
  process.exit(1);
}

const buf = readFileSync(file);
if (buf.length < 0x200 || buf.readUInt16LE(0) !== 0x5a4d) {
  console.error(`[patch-pe] not a valid PE file: ${file}`);
  process.exit(1);
}

const peOffset = buf.readUInt32LE(0x3c);
if (buf.readUInt32LE(peOffset) !== 0x00004550) {
  console.error(`[patch-pe] missing PE signature: ${file}`);
  process.exit(1);
}

const optionalHeader = peOffset + 24;
const magic = buf.readUInt16LE(optionalHeader);
let subsystemOffset;
if (magic === 0x20b) {
  subsystemOffset = optionalHeader + 0x44;
} else if (magic === 0x10b) {
  subsystemOffset = optionalHeader + 0x5c;
} else {
  console.error(`[patch-pe] unknown optional header magic 0x${magic.toString(16)}`);
  process.exit(1);
}

const current = buf.readUInt16LE(subsystemOffset);
if (current === IMAGE_SUBSYSTEM_WINDOWS_GUI) {
  console.log(`[patch-pe] already WINDOWS subsystem: ${file}`);
  process.exit(0);
}

if (current !== IMAGE_SUBSYSTEM_WINDOWS_CUI) {
  console.error(`[patch-pe] unexpected subsystem ${current} in ${file}`);
  process.exit(1);
}

buf.writeUInt16LE(IMAGE_SUBSYSTEM_WINDOWS_GUI, subsystemOffset);
writeFileSync(file, buf);
console.log(`[patch-pe] patched CONSOLE -> WINDOWS: ${file}`);
