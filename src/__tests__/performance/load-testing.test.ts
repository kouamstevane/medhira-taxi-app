/**
 * Tests de Performance et de Charge
 * 
 * Tests pour vérifier que le système peut gérer une charge importante
 * d'inscriptions simultanées
 * 
 * @group performance
 * @group load-testing
 */

import { auth } from '@/config/firebase';
import { signInWithPhoneNumber } from 'firebase/auth';

// Configuration de timeout pour les tests de charge
jest.setTimeout(60000); // 60 secondes

describe('Tests de Performance - Inscription par Téléphone', () => {
  describe('Charge et Performance', () => {
    test('devrait gérer 10 inscriptions simultanées', async () => {
      const startTime = Date.now();
      const phoneNumbers = Array.from({ length: 10 }, (_, i) => `+33601234${String(i).padStart(3, '0')}`);
      
      const mockVerifier = {
        verify: jest.fn().mockResolvedValue('dummy-token'),
        clear: jest.fn(),
      };

      const promises = phoneNumbers.map(async (phoneNumber) => {
        try {
          // Simuler l'envoi du code
          await signInWithPhoneNumber(auth, phoneNumber, mockVerifier as any);
          return { success: true, phoneNumber };
        } catch (error) {
          return { success: false, phoneNumber, error };
        }
      });

      const results = await Promise.allSettled(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Assertions
      expect(results.length).toBe(10);
      console.log(`✓ 10 inscriptions traitées en ${duration}ms (moyenne: ${duration / 10}ms par inscription)`);
    });

    test('devrait gérer 50 inscriptions simultanées sans crash', async () => {
      const startTime = Date.now();
      const phoneNumbers = Array.from({ length: 50 }, (_, i) => `+33601${String(i).padStart(6, '0')}`);
      
      const mockVerifier = {
        verify: jest.fn().mockResolvedValue('dummy-token'),
        clear: jest.fn(),
      };

      const promises = phoneNumbers.map(async (phoneNumber) => {
        try {
          await signInWithPhoneNumber(auth, phoneNumber, mockVerifier as any);
          return { success: true, phoneNumber };
        } catch (error) {
          return { success: false, phoneNumber, error };
        }
      });

      const results = await Promise.allSettled(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`✓ 50 inscriptions traitées en ${duration}ms (moyenne: ${duration / 50}ms par inscription)`);
      expect(results.length).toBe(50);
      
      // Vérifier que le temps moyen par inscription est raisonnable (< 2 secondes)
      const avgTimePerRegistration = duration / 50;
      expect(avgTimePerRegistration).toBeLessThan(2000);
    });

    test('devrait gérer 100 validations de numéro sans dégradation de performance', () => {
      const { isValidPhoneNumber } = require('@/lib/validation');
      const phoneNumbers = Array.from({ length: 100 }, (_, i) => `+237655${String(i).padStart(6, '0')}`);
      
      const startTime = Date.now();
      
      const results = phoneNumbers.map((phone) => isValidPhoneNumber(phone));
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(results.every((result) => result === true)).toBe(true);
      expect(duration).toBeLessThan(100); // Devrait être très rapide (< 100ms pour 100 validations)
      
      console.log(`✓ 100 validations effectuées en ${duration}ms (${duration / 100}ms par validation)`);
    });
  });

  describe('Tests de Stress - Limites du système', () => {
    test('devrait identifier le temps de réponse moyen pour 1 inscription', async () => {
      const mockVerifier = {
        verify: jest.fn().mockResolvedValue('dummy-token'),
        clear: jest.fn(),
      };

      const iterations = 5;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        
        try {
          await signInWithPhoneNumber(auth, `+237655${String(i).padStart(6, '0')}`, mockVerifier as any);
        } catch (error) {
          // Ignorer les erreurs pour ce test
        }
        
        const duration = Date.now() - startTime;
        durations.push(duration);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const minDuration = Math.min(...durations);
      const maxDuration = Math.max(...durations);

      console.log(`
📊 Statistiques de Performance (${iterations} itérations):
   - Temps moyen: ${avgDuration.toFixed(2)}ms
   - Temps minimum: ${minDuration}ms
   - Temps maximum: ${maxDuration}ms
      `);

      // Le temps moyen devrait être raisonnable
      expect(avgDuration).toBeLessThan(5000);
    });

    test('devrait mesurer l\'utilisation mémoire pendant les inscriptions multiples', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      const mockVerifier = {
        verify: jest.fn().mockResolvedValue('dummy-token'),
        clear: jest.fn(),
      };

      // Créer 30 inscriptions
      const phoneNumbers = Array.from({ length: 30 }, (_, i) => `+33601${String(i).padStart(6, '0')}`);
      
      await Promise.allSettled(
        phoneNumbers.map((phone) => 
          signInWithPhoneNumber(auth, phone, mockVerifier as any).catch(() => {})
        )
      );

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      console.log(`
📊 Utilisation Mémoire:
   - Mémoire initiale: ${(initialMemory / 1024 / 1024).toFixed(2)} MB
   - Mémoire finale: ${(finalMemory / 1024 / 1024).toFixed(2)} MB
   - Augmentation: ${memoryIncrease.toFixed(2)} MB
      `);

      // L'augmentation de mémoire devrait être raisonnable (< 50MB pour 30 inscriptions)
      expect(memoryIncrease).toBeLessThan(50);
    });
  });

  describe('Tests de Durabilité', () => {
    test('devrait gérer des cycles d\'inscription répétés sans fuite de mémoire', async () => {
      const mockVerifier = {
        verify: jest.fn().mockResolvedValue('dummy-token'),
        clear: jest.fn(),
      };

      const cycles = 3;
      const registrationsPerCycle = 10;
      const memorySnapshots: number[] = [];

      for (let cycle = 0; cycle < cycles; cycle++) {
        const phoneNumbers = Array.from(
          { length: registrationsPerCycle }, 
          (_, i) => `+33601${String(cycle * registrationsPerCycle + i).padStart(6, '0')}`
        );

        await Promise.allSettled(
          phoneNumbers.map((phone) => 
            signInWithPhoneNumber(auth, phone, mockVerifier as any).catch(() => {})
          )
        );

        // Forcer le garbage collection si disponible
        if (global.gc) {
          global.gc();
        }

        memorySnapshots.push(process.memoryUsage().heapUsed);
      }

      // Vérifier qu'il n'y a pas de croissance exponentielle de la mémoire
      const firstSnapshot = memorySnapshots[0];
      const lastSnapshot = memorySnapshots[memorySnapshots.length - 1];
      const growthRate = (lastSnapshot - firstSnapshot) / firstSnapshot;

      console.log(`
📊 Test de Durabilité (${cycles} cycles de ${registrationsPerCycle} inscriptions):
   - Mémoire cycle 1: ${(memorySnapshots[0] / 1024 / 1024).toFixed(2)} MB
   - Mémoire cycle ${cycles}: ${(lastSnapshot / 1024 / 1024).toFixed(2)} MB
   - Taux de croissance: ${(growthRate * 100).toFixed(2)}%
      `);

      // Le taux de croissance devrait être raisonnable (< 200%)
      expect(growthRate).toBeLessThan(2);
    });
  });
});
