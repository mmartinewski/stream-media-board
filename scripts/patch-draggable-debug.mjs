/**
 * react-draggable reads process.env.DRAGGABLE_DEBUG on mousedown.
 * That throws in the browser and aborts drag. Patch after install.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLD = 'if (process.env.DRAGGABLE_DEBUG) console.log(...args);';
const NEW =
  'if (typeof process !== "undefined" && process.env && process.env.DRAGGABLE_DEBUG) console.log(...args);';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'node_modules',
  'react-draggable',
  'build',
);

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.m?js$/.test(name)) continue;
    const text = fs.readFileSync(full, 'utf8');
    if (!text.includes(OLD)) continue;
    fs.writeFileSync(full, text.replaceAll(OLD, NEW));
    console.log('[patch-draggable-debug]', path.relative(process.cwd(), full));
  }
}

walk(root);
