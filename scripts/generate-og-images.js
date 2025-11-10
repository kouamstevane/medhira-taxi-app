/**
 * Script pour générer les images Open Graph
 */

const fs = require('fs');
const path = require('path');

try {
  const sharp = require('sharp');
  
  const ogImages = [
    { 
      input: 'og-image.svg',
      output: 'og-image.png',
      width: 1200,
      height: 630
    },
    { 
      input: 'og-image.svg',
      output: 'twitter-image.png',
      width: 1200,
      height: 600
    }
  ];

  const imagesPath = path.join(__dirname, '..', 'public', 'images');

  async function generateOGImages() {
    for (const { input, output, width, height } of ogImages) {
      const inputPath = path.join(imagesPath, input);
      const outputPath = path.join(imagesPath, output);
      
      await sharp(inputPath)
        .resize(width, height, { fit: 'cover' })
        .png()
        .toFile(outputPath);
      
      console.log(`✅ ${output} généré avec succès!`);
    }
    console.log('\n🎉 Toutes les images Open Graph ont été générées!');
  }

  generateOGImages().catch(console.error);

} catch (error) {
  console.error('❌ Erreur:', error.message);
}



