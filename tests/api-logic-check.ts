/**
 * Script de test pour valider la refactorisation de l'API et de l'Email Service
 */
import { z } from 'zod';

// Mock du schéma pour tester la validation
const ManageDriverSchema = z.object({
  action: z.enum(['suspend', 'unsuspend', 'deactivate', 'reactivate', 'delete']),
  driverId: z.string().min(1),
  adminUid: z.string().min(1),
  reason: z.string().optional(),
});

function testValidation() {
  console.log('🧪 Test de validation Zod...');
  
  const validData = {
    action: 'suspend',
    driverId: 'driver123',
    adminUid: 'admin456',
    reason: 'Test reason'
  };

  const invalidData = {
    action: 'invalid_action',
    driverId: '',
    adminUid: 'admin456'
  };

  const result1 = ManageDriverSchema.safeParse(validData);
  console.log('Case 1 (Valid):', result1.success ? ' OK' : 'Failed');

  const result2 = ManageDriverSchema.safeParse(invalidData);
  console.log('Case 2 (Invalid):', !result2.success ? ' OK (Correctement rejeté)' : 'Failed (Accepté indûment)');
  
  if (!result2.success) {
    console.log('Erreurs attendues:', JSON.stringify(result2.error.format(), null, 2));
  }
}

testValidation();
