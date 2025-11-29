/*avant 
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
*/
//debut
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
//fin

console.log('🔄 Conversion du fichier taxi-booking.svg...\n');

const svgPath = path.join(__dirname, 'public/images/taxi-booking.svg');
const webpPath = path.join(__dirname, 'public/images/taxi-booking.webp');

// Lire le fichier SVG
const svgContent = fs.readFileSync(svgPath, 'utf8');

// Extraire le base64 PNG embarqué
const base64Match = svgContent.match(/data:image\/png;base64,([^"]+)/);

if (base64Match) {
  console.log('✅ Image PNG base64 trouvée dans le SVG');
  
  // Convertir le base64 en buffer
  const imageBuffer = Buffer.from(base64Match[1], 'base64');
  
  console.log(`📏 Taille de l'image PNG: ${(imageBuffer.length / 1024 / 1024).toFixed(2)} MB`);
  
  // Convertir en WebP
  sharp(imageBuffer)
    .webp({ quality: 85, effort: 6 })
    .toFile(webpPath)
    .then(info => {
      const originalSize = imageBuffer.length;
      const newSize = info.size;
      const saved = ((originalSize - newSize) / originalSize * 100).toFixed(1);
      
      console.log(`\n✅ Conversion réussie!`);
      console.log(`   Taille originale: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Taille WebP: ${(newSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Économie: ${saved}%`);
      console.log(`\n💡 Vous pouvez maintenant supprimer taxi-booking.svg et utiliser taxi-booking.webp`);
    })
    .catch(err => {
      console.error('❌ Erreur lors de la conversion:', err);
    });
} else {
  console.log('❌ Aucune image base64 trouvée dans le SVG');
}
