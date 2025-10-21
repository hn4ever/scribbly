import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

loadEnv({ path: resolve(root, '.env.local'), override: true });
loadEnv({ path: resolve(root, '.env'), override: false });

const copies = [
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
  await buildManifest();
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

async function buildManifest() {
  const manifestPath = resolve(root, 'extension/manifest.json');
  const outputPath = resolve(root, 'dist/manifest.json');
  const manifestRaw = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw);

  const writerToken = process.env.SCRIBBLY_WRITER_ORIGIN_TRIAL_TOKEN;
  const rewriterToken = process.env.SCRIBBLY_REWRITER_ORIGIN_TRIAL_TOKEN;
  const enableOriginTrials = process.env.SCRIBBLY_ENABLE_ORIGIN_TRIALS === 'true';

  if (enableOriginTrials && writerToken && rewriterToken) {
    manifest.origin_trials = [
      {
        feature: 'WriterAPI',
        expiry: '2026-01-26',
        tokens: [writerToken]
      },
      {
        feature: 'RewriterAPI',
        expiry: '2026-01-26',
        tokens: [rewriterToken]
      }
    ];
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(manifest, null, 2));
}
