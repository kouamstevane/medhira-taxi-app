#!/usr/bin/env node

/**
 * Script de génération de clé de chiffrement pour le développement
 * 
 * Usage:
 *   node scripts/generate-encryption-key.js
 * 
 * Ce script génère une clé de chiffrement aléatoire de 256 bits (32 bytes)
 * encodée en base64 pour une utilisation avec le service de chiffrement.
 * 
 * ⚠️ IMPORTANT: Utilisez cette clé UNIQUEMENT pour le développement.
 * En production, utilisez Firebase Secret Manager.
 */

import crypto from 'crypto';

console.log('=================================================');
console.log('  Générateur de Clé de Chiffrement - Développement');
console.log('=================================================\n');

// Générer une clé aléatoire de 32 bytes (256 bits)
const key = crypto.randomBytes(32);
const base64Key = key.toString('base64');

console.log('✅ Clé générée avec succès!\n');
console.log('Ajoutez cette clé à votre fichier .env.local:\n');
console.log(`ENCRYPTION_MASTER_KEY=${base64Key}\n`);
console.log('=================================================\n');
console.log('⚠️  IMPORTANT:\n');
console.log('1. NE COMMITTEZ JAMAIS cette clé dans le repository');
console.log('2. Ajoutez .env.local à .gitignore');
console.log('3. Utilisez Firebase Secret Manager en production');
console.log('4. Faites tourner les clés périodiquement\n');
console.log('=================================================\n');

// Optionnel: Afficher la clé au format hex aussi
console.log('Format hexadécimal (si nécessaire):');
console.log(key.toString('hex') + '\n');

console.log('Pour plus d\'informations, consultez:');
console.log('docs/ENCRYPTION_MIGRATION_GUIDE.md\n');
