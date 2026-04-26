import {
  isValidEmail,
  isValidPassword,
  getPasswordCriteria,
  isValidPhoneNumber,
  isValidAmount,
  isValidLength,
  isValidName,
  isValidLicensePlate,
  isValidUrl,
  isValidFutureDate,
  isValidAge,
  sanitizeString,
  validateObject,
  ValidationSchema,
} from '@/lib/validation';

describe('validation — tests complets', () => {
  describe('isValidEmail', () => {
    it('accepte un email valide standard', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
    });

    it('accepte un email avec sous-domaine', () => {
      expect(isValidEmail('user@mail.example.com')).toBe(true);
    });

    it('accepte un email avec point dans la partie locale', () => {
      expect(isValidEmail('first.last@example.com')).toBe(true);
    });

    it('accepte un email avec tiret dans le domaine', () => {
      expect(isValidEmail('user@my-domain.com')).toBe(true);
    });

    it('rejette un email sans @', () => {
      expect(isValidEmail('userexample.com')).toBe(false);
    });

    it('rejette un email avec double @', () => {
      expect(isValidEmail('user@@example.com')).toBe(false);
    });

    it('rejette un email avec des espaces', () => {
      expect(isValidEmail('user @example.com')).toBe(false);
    });

    it('rejette une chaîne vide', () => {
      expect(isValidEmail('')).toBe(false);
    });

    it('rejette un email sans domaine', () => {
      expect(isValidEmail('user@')).toBe(false);
    });

    it('rejette un email sans extension', () => {
      expect(isValidEmail('user@example')).toBe(false);
    });

    it('rejette un email sans partie locale', () => {
      expect(isValidEmail('@example.com')).toBe(false);
    });
  });

  describe('isValidPassword', () => {
    it('accepte un mot de passe valide', () => {
      expect(isValidPassword('Abc12345')).toBe(true);
    });

    it('accepte un mot de passe avec caractères spéciaux', () => {
      expect(isValidPassword('MyP@ss123')).toBe(true);
    });

    it('rejette un mot de passe trop court (< 8)', () => {
      expect(isValidPassword('Abc123')).toBe(false);
    });

    it('rejette un mot de passe sans majuscule', () => {
      expect(isValidPassword('abcdef12')).toBe(false);
    });

    it('rejette un mot de passe sans minuscule', () => {
      expect(isValidPassword('ABCDEF12')).toBe(false);
    });

    it('rejette un mot de passe sans chiffre', () => {
      expect(isValidPassword('Abcdefgh')).toBe(false);
    });

    it('rejette une chaîne vide', () => {
      expect(isValidPassword('')).toBe(false);
    });

    it('accepte un mot de passe avec exactement 8 caractères valides', () => {
      expect(isValidPassword('A1bcdefg')).toBe(true);
    });
  });

  describe('getPasswordCriteria', () => {
    it('retourne tous les critères à true pour un mot de passe valide', () => {
      const criteria = getPasswordCriteria('Abc12345');
      expect(criteria.length).toBe(true);
      expect(criteria.uppercase).toBe(true);
      expect(criteria.lowercase).toBe(true);
      expect(criteria.number).toBe(true);
    });

    it('retourne length false pour un mot de passe trop court', () => {
      expect(getPasswordCriteria('Ab1').length).toBe(false);
    });

    it('retourne uppercase false pour un mot de passe sans majuscule', () => {
      expect(getPasswordCriteria('abcdef12').uppercase).toBe(false);
    });

    it('retourne lowercase false pour un mot de passe sans minuscule', () => {
      expect(getPasswordCriteria('ABCDEF12').lowercase).toBe(false);
    });

    it('retourne number false pour un mot de passe sans chiffre', () => {
      expect(getPasswordCriteria('Abcdefgh').number).toBe(false);
    });

    it('retourne tout false pour une chaîne vide', () => {
      const criteria = getPasswordCriteria('');
      expect(criteria.length).toBe(false);
      expect(criteria.uppercase).toBe(false);
      expect(criteria.lowercase).toBe(false);
      expect(criteria.number).toBe(false);
    });
  });

  describe('isValidPhoneNumber', () => {
    it('accepte un numéro camerounais valide', () => {
      expect(isValidPhoneNumber('+237655744484')).toBe(true);
    });

    it('accepte un numéro avec espaces', () => {
      expect(isValidPhoneNumber('+237 655 744 484')).toBe(true);
    });

    it('rejette un numéro sans indicatif', () => {
      expect(isValidPhoneNumber('655744484')).toBe(false);
    });

    it('rejette une chaîne vide', () => {
      expect(isValidPhoneNumber('')).toBe(false);
    });

    it('valide avec un countryCode correct (Cameroun)', () => {
      expect(isValidPhoneNumber('+237655744484', '+237')).toBe(true);
    });

    it('rejette si le numéro ne commence pas par le countryCode fourni', () => {
      expect(isValidPhoneNumber('+33612345678', '+237')).toBe(false);
    });

    it('rejette si la longueur nationale ne correspond pas au pays', () => {
      expect(isValidPhoneNumber('+2376557444', '+237')).toBe(false);
    });

    it('accepte un numéro valide sans countryCode', () => {
      expect(isValidPhoneNumber('+33612345678')).toBe(true);
    });
  });

  describe('isValidAmount', () => {
    it('accepte un montant positif', () => {
      expect(isValidAmount(10)).toBe(true);
    });

    it('accepte zéro', () => {
      expect(isValidAmount(0)).toBe(true);
    });

    it('rejette un montant négatif', () => {
      expect(isValidAmount(-5)).toBe(false);
    });

    it('accepte un montant avec 2 décimales', () => {
      expect(isValidAmount(10.99)).toBe(true);
    });

    it('rejette un montant avec plus de 2 décimales', () => {
      expect(isValidAmount(10.999)).toBe(false);
    });

    it('accepte un montant dans les bornes [min, max]', () => {
      expect(isValidAmount(50, 10, 100)).toBe(true);
    });

    it('rejette un montant inférieur au min', () => {
      expect(isValidAmount(5, 10, 100)).toBe(false);
    });

    it('rejette un montant supérieur au max', () => {
      expect(isValidAmount(150, 10, 100)).toBe(false);
    });

    it('accepte un montant exactement égal au min', () => {
      expect(isValidAmount(10, 10)).toBe(true);
    });

    it('accepte un montant entier sans décimales', () => {
      expect(isValidAmount(42)).toBe(true);
    });
  });

  describe('isValidLength', () => {
    it('accepte un texte dans la plage valide', () => {
      expect(isValidLength('Bonjour', 1, 20)).toBe(true);
    });

    it('rejette un texte trop court', () => {
      expect(isValidLength('Hi', 3, 10)).toBe(false);
    });

    it('rejette un texte trop long', () => {
      expect(isValidLength('Un texte très très long', 1, 5)).toBe(false);
    });

    it('accepte à la borne minimale exacte', () => {
      expect(isValidLength('abc', 3, 10)).toBe(true);
    });

    it('accepte à la borne maximale exacte', () => {
      expect(isValidLength('abcdef', 1, 6)).toBe(true);
    });

    it('trimme les espaces avant la vérification', () => {
      expect(isValidLength('  abc  ', 3, 5)).toBe(true);
    });

    it('rejette une chaîne vide si min > 0', () => {
      expect(isValidLength('', 1, 10)).toBe(false);
    });
  });

  describe('isValidName', () => {
    it('accepte un nom simple', () => {
      expect(isValidName('Alice')).toBe(true);
    });

    it('accepte un nom avec accents', () => {
      expect(isValidName('Élise')).toBe(true);
    });

    it('accepte un nom composé avec tiret', () => {
      expect(isValidName('Jean-Pierre')).toBe(true);
    });

    it('accepte un nom avec espace', () => {
      expect(isValidName('Marie Curie')).toBe(true);
    });

    it('accepte un nom avec apostrophe', () => {
      expect(isValidName("O'Brien")).toBe(true);
    });

    it('rejette un nom trop court (< 2 caractères)', () => {
      expect(isValidName('A')).toBe(false);
    });

    it('rejette un nom avec des chiffres', () => {
      expect(isValidName('Alice123')).toBe(false);
    });

    it('rejette un nom avec des caractères spéciaux', () => {
      expect(isValidName('Alice@')).toBe(false);
    });

    it('rejette une chaîne vide', () => {
      expect(isValidName('')).toBe(false);
    });

    it('rejette un nom composé uniquement d\'espaces', () => {
      expect(isValidName('   ')).toBe(false);
    });
  });

  describe('isValidLicensePlate', () => {
    it('accepte le format ABC-123', () => {
      expect(isValidLicensePlate('ABC-123')).toBe(true);
    });

    it('accepte le format ABC 123', () => {
      expect(isValidLicensePlate('ABC 123')).toBe(true);
    });

    it('accepte le format 1234 ABCD', () => {
      expect(isValidLicensePlate('1234 ABCD')).toBe(true);
    });

    it('accepte le format sans séparateur AB1234', () => {
      expect(isValidLicensePlate('AB1234')).toBe(true);
    });

    it('accepte le format AB-CD', () => {
      expect(isValidLicensePlate('AB-CD')).toBe(true);
    });

    it('accepte le format en minuscules', () => {
      expect(isValidLicensePlate('abc-123')).toBe(true);
    });

    it('rejette une chaîne vide', () => {
      expect(isValidLicensePlate('')).toBe(false);
    });

    it('rejette un format trop court', () => {
      expect(isValidLicensePlate('A1')).toBe(false);
    });

    it('rejette un format avec des caractères spéciaux', () => {
      expect(isValidLicensePlate('ABC@123')).toBe(false);
    });

    it('accepte un format avec espaces autour (trim)', () => {
      expect(isValidLicensePlate('  ABC-123  ')).toBe(true);
    });
  });

  describe('isValidUrl', () => {
    it('accepte une URL http valide', () => {
      expect(isValidUrl('http://example.com')).toBe(true);
    });

    it('accepte une URL https valide', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
    });

    it('accepte une URL avec chemin', () => {
      expect(isValidUrl('https://example.com/path/to/page')).toBe(true);
    });

    it('accepte une URL avec query params', () => {
      expect(isValidUrl('https://example.com?query=test')).toBe(true);
    });

    it('rejette une chaîne vide', () => {
      expect(isValidUrl('')).toBe(false);
    });

    it('rejette une URL sans protocole', () => {
      expect(isValidUrl('example.com')).toBe(false);
    });

    it('rejette du texte aléatoire', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
    });

    it('accepte une URL avec port', () => {
      expect(isValidUrl('http://localhost:3000')).toBe(true);
    });
  });

  describe('isValidFutureDate', () => {
    it('accepte une date future', () => {
      const future = new Date();
      future.setFullYear(future.getFullYear() + 1);
      expect(isValidFutureDate(future)).toBe(true);
    });

    it('accepte une date future en format string ISO', () => {
      const future = new Date();
      future.setFullYear(future.getFullYear() + 1);
      expect(isValidFutureDate(future.toISOString())).toBe(true);
    });

    it('rejette une date passée', () => {
      const past = new Date();
      past.setFullYear(past.getFullYear() - 1);
      expect(isValidFutureDate(past)).toBe(false);
    });

    it('rejette la date actuelle (pas strictement future)', () => {
      expect(isValidFutureDate(new Date())).toBe(false);
    });
  });

  describe('isValidAge', () => {
    it('accepte un age de 25 ans (>= 18)', () => {
      const birthDate = new Date();
      birthDate.setFullYear(birthDate.getFullYear() - 25);
      expect(isValidAge(birthDate)).toBe(true);
    });

    it('accepte exactement 18 ans', () => {
      const birthDate = new Date();
      birthDate.setFullYear(birthDate.getFullYear() - 18);
      expect(isValidAge(birthDate)).toBe(true);
    });

    it('rejette un age de 17 ans (< 18)', () => {
      const birthDate = new Date();
      birthDate.setFullYear(birthDate.getFullYear() - 17);
      birthDate.setDate(birthDate.getDate() + 1);
      expect(isValidAge(birthDate)).toBe(false);
    });

    it('accepte un age avec un minAge personnalisé', () => {
      const birthDate = new Date();
      birthDate.setFullYear(birthDate.getFullYear() - 21);
      expect(isValidAge(birthDate, 21)).toBe(true);
    });

    it('rejette un age inférieur au minAge personnalisé', () => {
      const birthDate = new Date();
      birthDate.setFullYear(birthDate.getFullYear() - 20);
      birthDate.setDate(birthDate.getDate() + 1);
      expect(isValidAge(birthDate, 21)).toBe(false);
    });

    it('accepte une date de naissance en format string', () => {
      const birthDate = new Date();
      birthDate.setFullYear(birthDate.getFullYear() - 30);
      expect(isValidAge(birthDate.toISOString())).toBe(true);
    });

    it('accepte minAge = 0', () => {
      const birthDate = new Date();
      birthDate.setFullYear(birthDate.getFullYear() - 5);
      expect(isValidAge(birthDate, 0)).toBe(true);
    });
  });

  describe('sanitizeString', () => {
    it('trimme les espaces en début et fin', () => {
      expect(sanitizeString('  bonjour  ')).toBe('bonjour');
    });

    it('retire les chevrons < >', () => {
      expect(sanitizeString('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script');
    });

    it('retire javascript:', () => {
      expect(sanitizeString('javascript:alert(1)')).toBe('alert(1)');
    });

    it('retire les gestionnaires d\'événements onclick=', () => {
      expect(sanitizeString('onclick=doSomething()')).toBe('doSomething()');
    });

    it('retire onmouseover= insensible à la casse', () => {
      expect(sanitizeString('ONMOUSEOVER=evil()')).toBe('evil()');
    });

    it('nettoie une chaîne complexe avec multiples patterns', () => {
      const input = '  <div onclick=alert(1)>javascript:evil</div>  ';
      const result = sanitizeString(input);
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
      expect(result).not.toContain('javascript:');
      expect(result).not.toContain('onclick=');
    });

    it('retourne une chaîne vide pour une entrée d\'espaces uniquement', () => {
      expect(sanitizeString('   ')).toBe('');
    });
  });

  describe('validateObject', () => {
    const schema: ValidationSchema = {
      name: { required: true, minLength: 2, maxLength: 50, message: 'Nom invalide' },
      email: { required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Email invalide' },
      bio: { maxLength: 200 },
      age: { required: true, custom: (v: unknown) => typeof v === 'number' && (v as number) >= 0 },
    };

    it('retourne des erreurs pour un champ required manquant', () => {
      const errors = validateObject({}, { name: { required: true } });
      expect(errors.name).toBeDefined();
    });

    it('retourne une erreur pour un champ vide si required', () => {
      const errors = validateObject({ name: '   ' }, { name: { required: true } });
      expect(errors.name).toBeDefined();
    });

    it('retourne une erreur minLength violation', () => {
      const errors = validateObject({ name: 'A' }, { name: { required: true, minLength: 2 } });
      expect(errors.name).toBeDefined();
    });

    it('retourne une erreur maxLength violation', () => {
      const errors = validateObject({ name: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' }, { name: { maxLength: 5 } });
      expect(errors.name).toBeDefined();
    });

    it('retourne une erreur de pattern violation', () => {
      const errors = validateObject({ email: 'not-an-email' }, { email: { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ } });
      expect(errors.email).toBeDefined();
    });

    it('retourne une erreur si le validateur custom échoue', () => {
      const errors = validateObject({ age: -5 }, { age: { custom: (v: unknown) => typeof v === 'number' && (v as number) >= 0 } });
      expect(errors.age).toBeDefined();
    });

    it('retourne un objet vide si toutes les validations passent', () => {
      const errors = validateObject(
        { name: 'Alice', email: 'alice@example.com', bio: 'Hello', age: 30 },
        schema,
      );
      expect(Object.keys(errors)).toHaveLength(0);
    });

    it('passe si un champ optionnel n\'est pas fourni', () => {
      const errors = validateObject(
        { name: 'Alice' },
        { name: { required: true, minLength: 2 }, bio: { maxLength: 200 } },
      );
      expect(errors.name).toBeUndefined();
      expect(errors.bio).toBeUndefined();
    });

    it('utilise le message personnalisé quand fourni', () => {
      const errors = validateObject({}, { name: { required: true, message: 'Le nom est obligatoire' } });
      expect(errors.name).toBe('Le nom est obligatoire');
    });

    it('utilise le message par défaut quand aucun message n\'est fourni', () => {
      const errors = validateObject({}, { name: { required: true } });
      expect(errors.name).toBe('name est requis');
    });

    it('retourne des erreurs pour plusieurs champs invalides', () => {
      const errors = validateObject(
        { name: 'A', email: 'bad' },
        schema,
      );
      expect(errors.name).toBeDefined();
      expect(errors.email).toBeDefined();
    });
  });
});
