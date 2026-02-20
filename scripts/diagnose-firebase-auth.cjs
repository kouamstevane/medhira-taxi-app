#!/usr/bin/env node
/**
 * Script de Diagnostic - Configuration Firebase Auth
 * 
 * Ce script vérifie la configuration de Firebase Auth et identifie
 * les problèmes potentiels avec l'authentification par téléphone.
 * 
 * Usage: node scripts/diagnose-firebase-auth.js
 */

const fs = require('fs');
const path = require('path');

// Charger les variables d'environnement depuis .env.local
function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env.local');
  
  if (!fs.existsSync(envPath)) {
    console.error('❌ Fichier .env.local non trouvé!');
    console.log('📝 Créez un fichier .env.local avec les variables Firebase requises.\n');
    return false;
  }

  const envContent = fs.readFileSync(envPath, 'utf-8');
  const lines = envContent.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const [key, ...valueParts] = trimmedLine.split('=');
      const value = valueParts.join('=').trim();
      if (key && value) {
        process.env[key] = value;
      }
    }
  }

  return true;
}

const diagnostics = [];

function addDiagnostic(result) {
  diagnostics.push(result);
}

function checkEnvironmentVariables() {
  console.log('\n🔍 Vérification des variables d\'environnement...\n');

  const requiredVars = [
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_APP_ID'
  ];

  let allPresent = true;

  for (const varName of requiredVars) {
    const value = process.env[varName];
    if (!value) {
      addDiagnostic({
        status: 'error',
        message: `Variable manquante: ${varName}`,
        details: 'Cette variable est requise pour Firebase Auth',
        fix: `Ajoutez ${varName} dans votre fichier .env.local`
      });
      allPresent = false;
    } else {
      const maskedValue = value.length > 20 ? `${value.substring(0, 20)}...` : value;
      console.log(`✅ ${varName}: ${maskedValue}`);
    }
  }

  if (allPresent) {
    addDiagnostic({
      status: 'success',
      message: 'Toutes les variables d\'environnement requises sont présentes'
    });
  }
}

function checkFirebaseConfig() {
  console.log('\n🔍 Vérification de la configuration Firebase...\n');

  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
  };

  if (!firebaseConfig.apiKey) {
    addDiagnostic({
      status: 'error',
      message: 'Clé API Firebase manquante',
      fix: 'Vérifiez que NEXT_PUBLIC_FIREBASE_API_KEY est défini dans .env.local'
    });
    return;
  }

  console.log(`✅ Project ID: ${firebaseConfig.projectId}`);
  console.log(`✅ Auth Domain: ${firebaseConfig.authDomain}`);
  console.log(`✅ App ID: ${firebaseConfig.appId}`);
  console.log(`✅ Storage Bucket: ${firebaseConfig.storageBucket}`);

  addDiagnostic({
    status: 'success',
    message: 'Configuration Firebase valide'
  });

  return firebaseConfig;
}

function checkPhoneAuthSetup() {
  console.log('\n🔍 Vérification de la configuration Auth par téléphone...\n');

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  
  // Vérifications qui ne peuvent être faites que dans Firebase Console
  const checks = [
    {
      name: 'Authentification par téléphone activée',
      status: 'unknown',
      consoleLocation: 'Firebase Console > Authentication > Sign-in method > Phone',
      instructions: [
        '1. Allez dans Firebase Console',
        '2. Sélectionnez le projet: medjira-service',
        '3. Navigation: Authentication > Sign-in method',
        '4. Activez "Phone" et cliquez sur Save'
      ]
    },
    {
      name: 'Domaine localhost autorisé',
      status: 'unknown',
      consoleLocation: 'Firebase Console > Authentication > Settings > Authorized domains',
      instructions: [
        '1. Allez dans Firebase Console',
        '2. Navigation: Authentication > Settings',
        '3. Ajoutez les domaines suivants:',
        '   - localhost',
        '   - 127.0.0.1',
        '   - 192.168.1.195 (votre IP locale)',
        '4. Cliquez sur Add pour chaque domaine'
      ]
    },
    {
      name: 'Quota SMS vérifié',
      status: 'unknown',
      consoleLocation: 'Firebase Console > Authentication > Usage',
      instructions: [
        '1. Dans Firebase Console > Authentication',
        '2. Cliquez sur l\'onglet "Usage"',
        '3. Vérifiez votre quota SMS restant',
        '4. Note: Firebase offre un quota gratuit pour les tests'
      ]
    }
  ];

  console.log('⚠️  Les vérifications suivantes nécessitent une action dans Firebase Console:\n');

  for (const check of checks) {
    const icon = check.status === 'valid' ? '✅' : check.status === 'invalid' ? '❌' : '⚠️ ';
    console.log(`${icon} ${check.name}`);
    console.log(`   📍 ${check.consoleLocation}`);
    console.log(`   📋 Instructions:`);
    for (const instruction of check.instructions) {
      console.log(`      ${instruction}`);
    }
    console.log('');
  }

  addDiagnostic({
    status: 'warning',
    message: 'Vérifications manuelles requises dans Firebase Console',
    details: 'L\'authentification par téléphone doit être configurée dans Firebase Console',
    fix: 'Suivez les instructions ci-dessus pour configurer Firebase Auth'
  });
}

function printDiagnostics() {
  console.log('\n' + '='.repeat(80));
  console.log('📋 RÉSUMÉ DU DIAGNOSTIC');
  console.log('='.repeat(80) + '\n');

  let errorCount = 0;
  let warningCount = 0;
  let successCount = 0;

  for (const diagnostic of diagnostics) {
    const icon = diagnostic.status === 'success' ? '✅' : diagnostic.status === 'error' ? '❌' : '⚠️ ';
    console.log(`${icon} ${diagnostic.message}`);

    if (diagnostic.details) {
      console.log(`   📝 ${diagnostic.details}`);
    }

    if (diagnostic.fix) {
      console.log(`   🔧 Solution: ${diagnostic.fix}`);
    }

    console.log('');

    if (diagnostic.status === 'error') errorCount++;
    else if (diagnostic.status === 'warning') warningCount++;
    else successCount++;
  }

  console.log('='.repeat(80));
  console.log(`Total: ${successCount} succès, ${warningCount} avertissements, ${errorCount} erreurs`);
  console.log('='.repeat(80) + '\n');

  if (errorCount > 0) {
    console.log('🔴 Des erreurs critiques ont été détectées.');
    console.log('Veuillez les corriger avant de continuer.\n');
  } else if (warningCount > 0) {
    console.log('🟡 Des avertissements ont été détectés.');
    console.log('Veuillez vérifier la configuration dans Firebase Console.\n');
  } else {
    console.log('🟢 Toutes les vérifications automatiques ont réussi!');
    console.log('Si vous avez encore des erreurs, vérifiez Firebase Console.\n');
  }
}

function main() {
  console.log('\n' + '='.repeat(80));
  console.log('🔧 DIAGNOSTIC FIREBASE AUTH - AUTHENTIFICATION PAR TÉLÉPHONE');
  console.log('='.repeat(80));

  // Charger les variables d'environnement
  const envLoaded = loadEnvFile();
  if (!envLoaded) {
    process.exit(1);
  }

  console.log('✅ Variables d\'environnement chargées depuis .env.local\n');

  checkEnvironmentVariables();
  checkFirebaseConfig();
  checkPhoneAuthSetup();

  printDiagnostics();

  console.log('📚 Pour plus d\'informations, consultez: FIREBASE_PHONE_AUTH_SETUP.md\n');
}

// Exécution du diagnostic
main();
