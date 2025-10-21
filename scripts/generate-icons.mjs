import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const logoPath = resolve('extension/assets/scribbly-logo.png');
const outputDir = resolve('extension/icons');
const sizes = [16, 32, 48, 128];

await mkdir(outputDir, { recursive: true });

await Promise.all(
  sizes.map((size) =>
    sharp(logoPath)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(resolve(outputDir, `scribbly-${size}.png`))
  )
);
