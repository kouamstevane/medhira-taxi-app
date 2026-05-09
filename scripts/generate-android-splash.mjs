import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const logoPath = resolve(projectRoot, '../logo/logoMedjira.optimized.svg');
const resDir = resolve(projectRoot, 'android/app/src/main/res');
const svg = readFileSync(logoPath);

const splashes = {
  drawable: [480, 320],
  'drawable-land-mdpi': [480, 320],
  'drawable-land-hdpi': [800, 480],
  'drawable-land-xhdpi': [1280, 720],
  'drawable-land-xxhdpi': [1600, 960],
  'drawable-land-xxxhdpi': [1920, 1280],
  'drawable-port-mdpi': [320, 480],
  'drawable-port-hdpi': [480, 800],
  'drawable-port-xhdpi': [720, 1280],
  'drawable-port-xxhdpi': [960, 1600],
  'drawable-port-xxxhdpi': [1280, 1920],
};

async function makeSplash(width, height) {
  const logoSize = Math.round(Math.min(width, height) * 0.25);
  const logo = await sharp(svg, { density: 600 })
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([
      {
        input: logo,
        left: Math.round((width - logoSize) / 2),
        top: Math.round((height - logoSize) / 2),
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

for (const [folder, [w, h]] of Object.entries(splashes)) {
  const buf = await makeSplash(w, h);
  writeFileSync(resolve(resDir, folder, 'splash.png'), buf);
  console.log(`${folder}/splash.png @ ${w}x${h}  (${(buf.length / 1024).toFixed(1)} KB)`);
}
console.log('Done.');
