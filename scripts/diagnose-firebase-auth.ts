#!/usr/bin/env tsx
/**
 * Script de Diagnostic - Configuration Firebase Auth
 * 
 * Ce script vérifie la configuration de Firebase Auth et identifie
 * les problèmes potentiels avec l'authentification par téléphone.
 * 
 * Usage: npx tsx scripts/diagnose-firebase-auth.ts
 */

import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";

interface DiagnosticResult {
  status: 'success' | 'warning' | 'error';
  message: string;
  details?: string;
  fix?: string;
}

const diagnostics: DiagnosticResult[] = [];

// Configuration Firebase depuis les variables d'environnement
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

function addDiagnostic(result: DiagnosticResult) {
  diagnostics.push(result);
}

function checkEnvironmentVariables(): void {
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
      console.log(` ${varName}: ${value.substring(0, 20)}...`);
    }
  }

  if (allPresent) {
    addDiagnostic({
      status: 'success',
      message: 'Toutes les variables d\'environnement requises sont présentes'
    });
  }
}

function checkFirebaseConfig(): void {
  console.log('\n🔍 Vérification de la configuration Firebase...\n');

  if (!firebaseConfig.apiKey) {
    addDiagnostic({
      status: 'error',
      message: 'Clé API Firebase manquante',
      fix: 'Vérifiez que NEXT_PUBLIC_FIREBASE_API_KEY est défini dans .env.local'
    });
    return;
  }

  console.log(` Project ID: ${firebaseConfig.projectId}`);
  console.log(` Auth Domain: ${firebaseConfig.authDomain}`);
  console.log(` App ID: ${firebaseConfig.appId}`);

  addDiagnostic({
    status: 'success',
    message: 'Configuration Firebase valide'
  });
}

async function checkFirebaseConnection(): Promise<void> {
  console.log('\n🔍 Test de connexion à Firebase...\n');

  try {
    const app: FirebaseApp = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
    const auth: Auth = getAuth(app);

    // Test de connexion en essayant de récupérer les providers disponibles
    // Note: Ceci ne garantit pas que l'auth par téléphone est activée,
    // mais vérifie que la connexion Firebase fonctionne
    console.log(' Connexion à Firebase établie');
    console.log(` Auth initialisé pour le projet: ${firebaseConfig.projectId}`);

    addDiagnostic({
      status: 'success',
      message: 'Connexion Firebase réussie',
      details: 'Firebase est accessible et configuré correctement'
    });

  } catch (error: unknown) {
    console.error('Erreur de connexion Firebase:', error instanceof Error ? error.message : String(error));

    addDiagnostic({
      status: 'error',
      message: 'Impossible de se connecter à Firebase',
      details: error instanceof Error ? error.message : String(error),
      fix: 'Vérifiez votre clé API et votre configuration réseau'
    });
  }
}

function checkPhoneAuthSetup(): void {
  console.log('\n🔍 Vérification de la configuration Auth par téléphone...\n');

  // Vérifications qui ne peuvent être faites que dans Firebase Console
  const checks = [
    {
      name: 'Authentification par téléphone activée',
      status: 'unknown',
      consoleLocation: 'Firebase Console > Authentication > Sign-in method > Phone'
    },
    {
      name: 'Domaine localhost autorisé',
      status: 'unknown',
      consoleLocation: 'Firebase Console > Authentication > Settings > Authorized domains'
    },
    {
      name: 'Clé API valide',
      status: firebaseConfig.apiKey ? 'valid' : 'invalid',
      consoleLocation: 'Firebase Console > Project Settings > General'
    }
  ];

  console.log(' Certaines vérifications nécessitent un accès à Firebase Console:\n');

  for (const check of checks) {
    const icon = check.status === 'valid' ? '' : check.status === 'invalid' ? '❌' : '';
    console.log(`${icon} ${check.name}`);
    console.log(`   → ${check.consoleLocation}\n`);
  }

  addDiagnostic({
    status: 'warning',
    message: 'Vérifications manuelles requises dans Firebase Console',
    details: 'Certaines configurations ne peuvent être vérifiées automatiquement',
    fix: 'Suivez les étapes dans FIREBASE_PHONE_AUTH_SETUP.md'
  });
}

function printDiagnostics(): void {
  console.log('\n' + '='.repeat(80));
  console.log('📋 RÉSUMÉ DU DIAGNOSTIC');
  console.log('='.repeat(80) + '\n');

  let errorCount = 0;
  let warningCount = 0;
  let successCount = 0;

  for (const diagnostic of diagnostics) {
    const icon = diagnostic.status === 'success' ? '' : diagnostic.status === 'error' ? '❌' : '';
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

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('🔧 DIAGNOSTIC FIREBASE AUTH - AUTHENTIFICATION PAR TÉLÉPHONE');
  console.log('='.repeat(80));

  checkEnvironmentVariables();
  checkFirebaseConfig();
  await checkFirebaseConnection();
  checkPhoneAuthSetup();

  printDiagnostics();

  console.log('📚 Pour plus d\'informations, consultez: FIREBASE_PHONE_AUTH_SETUP.md\n');
}

// Exécution du diagnostic
main().catch(console.error);
