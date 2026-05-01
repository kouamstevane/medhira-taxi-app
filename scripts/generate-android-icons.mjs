import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const logoPath = resolve(projectRoot, '../logo/logoMedjira.optimized.svg');
const resDir = resolve(projectRoot, 'android/app/src/main/res');

const svg = readFileSync(logoPath);

const launcherSizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

const foregroundSizes = {
  'mipmap-mdpi': 108,
  'mipmap-hdpi': 162,
  'mipmap-xhdpi': 216,
  'mipmap-xxhdpi': 324,
  'mipmap-xxxhdpi': 432,
};

async function renderLogo(size, padding = 0) {
  const inner = Math.round(size * (1 - padding * 2));
  const offset = Math.round((size - inner) / 2);
  const logo = await sharp(svg, { density: 600 })
    .resize(inner, inner, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: logo, left: offset, top: offset }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function renderForeground(size) {
  const inner = Math.round(size * 0.66);
  const offset = Math.round((size - inner) / 2);
  const logo = await sharp(svg, { density: 600 })
    .resize(inner, inner, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    },
  })
    .composite([{ input: logo, left: offset, top: offset }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

for (const [folder, size] of Object.entries(launcherSizes)) {
  const outDir = resolve(resDir, folder);
  mkdirSync(outDir, { recursive: true });
  const buf = await renderLogo(size);
  writeFileSync(resolve(outDir, 'ic_launcher.png'), buf);
  writeFileSync(resolve(outDir, 'ic_launcher_round.png'), buf);
  console.log(`${folder}/ic_launcher.png + round @ ${size}px`);
}

for (const [folder, size] of Object.entries(foregroundSizes)) {
  const outDir = resolve(resDir, folder);
  mkdirSync(outDir, { recursive: true });
  const buf = await renderForeground(size);
  writeFileSync(resolve(outDir, 'ic_launcher_foreground.png'), buf);
  console.log(`${folder}/ic_launcher_foreground.png @ ${size}px`);
}

console.log('Done.');
