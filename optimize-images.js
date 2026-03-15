import fs from 'fs';
import path from 'path';
import { optimize } from 'svgo';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.join(__dirname, 'public');
const IMAGES_DIR = path.join(PUBLIC_DIR, 'images');

console.log('🎨 Optimisation des images...\n');

// Optimiser les SVG AGRESSIVEMENT
async function optimizeSVGs() {
  const svgFiles = fs.readdirSync(IMAGES_DIR).filter(f => f.endsWith('.svg'));
  
  for (const file of svgFiles) {
    const filePath = path.join(IMAGES_DIR, file);
    const svgString = fs.readFileSync(filePath, 'utf8');
    const originalSize = Buffer.byteLength(svgString);
    
    try {
      const result = optimize(svgString, {
        path: filePath,
        multipass: true,
        plugins: [
          {
            name: 'preset-default',
            params: {
              overrides: {
                cleanupIds: true,
                removeUnknownsAndDefaults: true,
                removeUselessStrokeAndFill: true,
              },
            },
          },
          'removeViewBox',
          'removeDimensions',
          'removeScripts',
          'removeStyleElement',
          'removeComments',
          'removeMetadata',
          'removeEditorsNSData',
          'cleanupAttrs',
          'mergeStyles',
          'inlineStyles',
          'minifyStyles',
          'cleanupNumericValues',
          'convertColors',
          'removeEmptyAttrs',
          'removeEmptyContainers',
          'removeUnusedNS',
        ],
      });
      
      fs.writeFileSync(filePath, result.data);
      const newSize = Buffer.byteLength(result.data);
      const saved = ((originalSize - newSize) / originalSize * 100).toFixed(1);
      
      console.log(` ${file}: ${formatBytes(originalSize)} → ${formatBytes(newSize)} (${saved}% réduit)`);
    } catch (error) {
      console.error(`Erreur avec ${file}:`, error.message);
    }
  }
}

// Convertir PNG en WebP avec Sharp
async function convertPNGsToWebP() {
  const pngFiles = fs.readdirSync(IMAGES_DIR).filter(f => f.endsWith('.png'));
  
  console.log('\n🖼️  Conversion PNG → WebP...\n');
  
  for (const file of pngFiles) {
    const filePath = path.join(IMAGES_DIR, file);
    const webpPath = filePath.replace('.png', '.webp');
    const originalSize = fs.statSync(filePath).size;
    
    try {
      await sharp(filePath)
        .webp({ quality: 85, effort: 6 })
        .toFile(webpPath);
      
      const newSize = fs.statSync(webpPath).size;
      const saved = ((originalSize - newSize) / originalSize * 100).toFixed(1);
      console.log(` ${file} → ${file.replace('.png', '.webp')}: ${formatBytes(originalSize)} → ${formatBytes(newSize)} (${saved}% réduit)`);
      
      // Optionnel: supprimer l'ancien PNG pour gagner encore plus d'espace
      // fs.unlinkSync(filePath);
    } catch (error) {
      console.error(`Erreur avec ${file}:`, error.message);
    }
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

async function main() {
  await optimizeSVGs();
  await convertPNGsToWebP();
  console.log('\n✨ Optimisation terminée !');
}

main().catch(console.error);
