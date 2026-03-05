/**
 * Service client pour le chiffrement côté serveur
 *
 * Ce service appelle la Cloud Function Firebase pour chiffrer les données sensibles.
 * Le chiffrement est effectué côté serveur avec une clé stockée dans Firebase Secret Manager.
 *
 * @module ServerEncryptionService
 */

import { getFunctions, httpsCallable, Functions } from 'firebase/functions';
// ✅ CORRECTIF : Importer l'app Firebase déjà initialisée plutôt que d'appeler initializeApp()
// Rappeler initializeApp() cause "Firebase App named '[DEFAULT]' already exists"
import { app } from '../config/firebase';

// Type pour les données chiffrées retournées par le serveur
export interface EncryptedData {
  data: string; // Données chiffrées en base64
  iv: string; // IV en base64
  salt: string; // Salt en base64
}

export interface EncryptionResult {
  encrypted: EncryptedData;
}

/**
 * Service de chiffrement côté serveur
 *
 * Ce service remplace encryption.service.ts pour le chiffrement des données sensibles.
 * Toutes les opérations de chiffrement sont effectuées par la Cloud Function Firebase.
 */
class ServerEncryptionService {
  private functions: Functions;

  constructor() {
    // ✅ Utiliser l'instance Firebase déjà initialisée (évite "app already exists")
    // ✅ CORRECTIF CORS : fonctions déployées en us-central1, pas europe-west1
    this.functions = getFunctions(app, 'us-central1');
  }

  /**
   * Chiffre une donnée sensible côté serveur
   * 
   * @param plainText - Le texte en clair à chiffrer
   * @returns Les données chiffrées avec IV et salt
   * @throws Error si le chiffrement échoue
   */
  async encrypt(plainText: string): Promise<EncryptedData> {
    if (!plainText || plainText.length === 0) {
      throw new Error('Le texte à chiffrer ne peut pas être vide');
    }

    try {
      // Appeler la Cloud Function
      const encryptFunction = httpsCallable<{ plaintext: string }, EncryptionResult>(
        this.functions,
        'encryptSensitiveData'
      );

      const result = await encryptFunction({ plaintext: plainText });

      if (!result.data || !result.data.encrypted) {
        throw new Error('Format de réponse invalide du serveur');
      }

      return result.data.encrypted;
    } catch (error: unknown) {
      const err = error as any; // Cast for accessing .code property of Firebase error
      console.error('Erreur lors du chiffrement côté serveur:', err);

      // Gérer les erreurs spécifiques
      if (err.code === 'functions/unauthenticated') {
        throw new Error('Vous devez être connecté pour chiffrer des données.');
      } else if (err.code === 'functions/resource-exhausted') {
        throw new Error('Trop de tentatives. Réessayez dans une minute.');
      } else if (err.code === 'functions/invalid-argument') {
        throw new Error('Données à chiffrer invalides.');
      } else if (err.code === 'functions/internal') {
        throw new Error('Erreur serveur lors du chiffrement. Veuillez réessayer.');
      }

      // Erreur générique
      throw new Error(
        'Impossible de chiffrer les données. Vérifiez votre connexion et réessayez.'
      );
    }
  }

  /**
   * Vérifie si le service est disponible
   * 
   * @returns true si Firebase Functions est disponible
   */
  isAvailable(): boolean {
    return typeof window !== 'undefined' && 
           typeof window.crypto !== 'undefined' &&
           typeof window.crypto.subtle !== 'undefined';
  }

  /**
   * Chiffre les données bancaires pour la soumission
   * 
   * @param accountHolder - Titulaire du compte
   * @param iban - IBAN
   * @param bic - BIC/SWIFT
   * @returns Les données chiffrées
   */
  async encryptBankData(
    accountHolder: string,
    iban: string,
    bic: string
  ): Promise<EncryptedData> {
    const bankData = {
      holder: accountHolder,
      iban: iban,
      bic: bic
    };

    return this.encrypt(JSON.stringify(bankData));
  }

  /**
   * Chiffre le SSN/NIR pour la soumission
   * 
   * @param ssn - Numéro de sécurité sociale
   * @returns Les données chiffrées
   */
  async encryptSSN(ssn: string): Promise<EncryptedData> {
    return this.encrypt(ssn);
  }
}

// Exporter une instance singleton
export const serverEncryptionService = new ServerEncryptionService();

// Exporter le type pour TypeScript
export default ServerEncryptionService;
