import { cp, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const copies = [
  ['extension/manifest.json', 'dist/manifest.json'],
  ['extension/content/canvas-overlay.css', 'dist/content/canvas-overlay.css'],
  ['extension/icons', 'dist/icons'],
  ['extension/assets', 'dist/assets'],
  ['extension/popup/popup.css', 'dist/popup/popup.css']
];

async function ensureCopy(fromRelative, toRelative) {
  const from = resolve(root, fromRelative);
  const to = resolve(root, toRelative);
  try {
    await stat(from);
  } catch {
    return;
  }

  await mkdir(dirname(to), { recursive: true });
  await cp(from, to, { recursive: true });
}

async function run() {
  await Promise.all(copies.map(([from, to]) => ensureCopy(from, to)));
}

run().catch((error) => {
  console.error('[copy-static] failed:', error);
  process.exitCode = 1;
});
