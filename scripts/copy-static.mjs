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
  await Promise.all([flattenHtml('sidepanel'), flattenHtml('popup')]);
}

run().catch((error) => {
  console.error('[copy-static] failed:', error);
  process.exitCode = 1;
});

async function flattenHtml(entryName) {
  const candidates = [
    resolve(root, `dist/${entryName}/index.html`),
    resolve(root, `dist/extension/${entryName}/index.html`)
  ];
  const flat = resolve(root, `dist/${entryName}.html`);
  const source = await findExisting(candidates);
  if (!source) return;
  await mkdir(dirname(flat), { recursive: true });
  await cp(source, flat);
}

async function findExisting(paths) {
  for (const path of paths) {
    try {
      await stat(path);
      return path;
    } catch {
      // continue
    }
  }
  return null;
}
