#!/usr/bin/env node
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32') {
  throw new Error('The desktop runtime bundle currently targets Windows only.');
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const runtimeDir = join(root, 'desktop-runtime');
const targetNode = join(runtimeDir, 'node.exe');

mkdirSync(runtimeDir, { recursive: true });
copyFileSync(process.execPath, targetNode);

console.log(`[prepare-desktop-runtime] copied ${process.execPath} -> ${targetNode}`);
