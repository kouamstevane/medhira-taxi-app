/**
 * Tests Unitaires - Validation des Numéros de Téléphone
 * 
 * Tests de validation du format des numéros de téléphone pour différents pays
 * 
 * @group unit
 * @group phone-validation
 */

import { isValidPhoneNumber } from '@/lib/validation';

describe('Validation des numéros de téléphone', () => {
  describe('Cas nominaux - Numéros valides', () => {
    const validPhoneNumbers = [
      { phone: '+237655744484', country: 'Cameroun', description: 'Format Cameroun standard' },
      { phone: '+33612345678', country: 'France', description: 'Format France standard' },
      { phone: '+32470123456', country: 'Belgique', description: 'Format Belgique standard' },
      { phone: '+15550123456', country: 'Canada/USA', description: 'Format Amérique du Nord' },
      { phone: '+237699887766', country: 'Cameroun', description: 'Autre opérateur Cameroun' },
      { phone: '+33700112233', country: 'France', description: 'Numéro France alternatif' },
    ];

    validPhoneNumbers.forEach(({ phone, country, description }) => {
      test(`devrait accepter ${description}: ${phone}`, () => {
        expect(isValidPhoneNumber(phone)).toBe(true);
      });
    });

    test('devrait accepter un numéro avec espaces', () => {
      expect(isValidPhoneNumber('+237 655 744 484')).toBe(true);
    });
  });

  describe('Cas d\'erreur - Numéros invalides', () => {
    const invalidPhoneNumbers = [
      { phone: '655744484', reason: 'Sans indicatif pays (+)' },
      { phone: '+', reason: 'Seulement le symbole +' },
      { phone: '+0655744484', reason: 'Commence par 0 après +' },
      { phone: '+23765574448499999', reason: 'Trop long (> 15 chiffres)' },
      { phone: '+237', reason: 'Seulement l\'indicatif pays' },
      { phone: '00237655744484', reason: 'Format international 00 au lieu de +' },
      { phone: '+237-655-744-484', reason: 'Avec tirets' },
      { phone: '+237.655.744.484', reason: 'Avec points' },
      { phone: '+237(655)744484', reason: 'Avec parenthèses' },
      { phone: '', reason: 'Chaîne vide' },
      { phone: 'abcdefgh', reason: 'Caractères alphabétiques' },
      { phone: '+237abc744484', reason: 'Mélange chiffres et lettres' },
    ];

    invalidPhoneNumbers.forEach(({ phone, reason }) => {
      test(`devrait rejeter: ${reason} - "${phone}"`, () => {
        expect(isValidPhoneNumber(phone)).toBe(false);
      });
    });
  });

  describe('Cas limites (Edge cases)', () => {
    test('devrait gérer un numéro avec le minimum de chiffres (+1234567)', () => {
      expect(isValidPhoneNumber('+1234567')).toBe(true);
    });

    test('devrait gérer un numéro avec le maximum de chiffres (15)', () => {
      expect(isValidPhoneNumber('+123456789012345')).toBe(true);
    });

    test('devrait rejeter un numéro avec 16 chiffres', () => {
      expect(isValidPhoneNumber('+1234567890123456')).toBe(false);
    });

    test('devrait gérer plusieurs espaces consécutifs', () => {
      expect(isValidPhoneNumber('+237  655  744  484')).toBe(true);
    });

    test('devrait rejeter null comme entrée', () => {
      expect(isValidPhoneNumber(null as any)).toBe(false);
    });

    test('devrait rejeter undefined comme entrée', () => {
      expect(isValidPhoneNumber(undefined as any)).toBe(false);
    });
  });
});
