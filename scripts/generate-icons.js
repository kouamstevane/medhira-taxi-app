/**
 * Script pour générer les icônes PWA
 * 
 * Pour utiliser ce script, installez sharp:
 * npm install --save-dev sharp
 * 
 * Puis exécutez:
 * node scripts/generate-icons.js
 */

const fs = require('fs');
const path = require('path');

// Si sharp n'est pas installé, on affiche un message
try {
  const sharp = require('sharp');
  
  const sizes = [
    { size: 192, name: 'icon-192.png' },
    { size: 512, name: 'icon-512.png' },
    { size: 180, name: 'apple-icon.png' },
  ];

  const svgPath = path.join(__dirname, '..', 'public', 'icon.svg');
  const publicPath = path.join(__dirname, '..', 'public');

  async function generateIcons() {
    for (const { size, name } of sizes) {
      await sharp(svgPath)
        .resize(size, size)
        .png()
        .toFile(path.join(publicPath, name));
      
      console.log(`✅ ${name} généré avec succès!`);
    }
    console.log('\n🎉 Toutes les icônes ont été générées!');
  }

  generateIcons().catch(console.error);

} catch (error) {
  console.log('⚠️  Sharp n\'est pas installé.');
  console.log('\nPour générer les icônes automatiquement:');
  console.log('1. Installez sharp: npm install --save-dev sharp');
  console.log('2. Exécutez: node scripts/generate-icons.js');
  console.log('\nOu utilisez un outil en ligne:');
  console.log('🔗 https://realfavicongenerator.net/');
  console.log('🔗 https://www.favicon-generator.org/');
  console.log('\nTéléchargez public/icon.svg et générez les icônes en ligne.');
}





