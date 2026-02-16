"use client";
/* eslint-disable */
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth, db } from '@/config/firebase';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  PhoneAuthProvider,
  signInWithCredential,
  AuthErrorCodes,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { FiArrowLeft, FiUser, FiPhone, FiLock } from 'react-icons/fi';
import { isValidPhoneNumber } from '@/lib/validation';

// Liste des pays supportés avec codes, drapeaux et formats de numéro par défaut
const countries = [
  { code: 'CM', dialCode: '+237', name: 'Cameroun', flag: '🇨🇲', defaultNumber: '655744484' },
  { code: 'FR', dialCode: '+33', name: 'France', flag: '🇫🇷', defaultNumber: '612345678' },
  { code: 'BE', dialCode: '+32', name: 'Belgique', flag: '🇧🇪', defaultNumber: '470123456' },
  { code: 'CA', dialCode: '+1', name: 'Canada', flag: '🇨🇦', defaultNumber: '5550123456' },
];

export default function RegisterPhoneContent() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [code, setCode] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(countries[0]);
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const recaptchaVerifier = useRef<RecaptchaVerifier | null>(null);
  const countryDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Désactiver la vérification reCAPTCHA pour les tests en développement
    // Cela permet d'utiliser les numéros de test Firebase sans le widget
    if (process.env.NODE_ENV === 'development') {
      auth.settings.appVerificationDisabledForTesting = true;
    }

    return () => {
      if (recaptchaVerifier.current) {
        recaptchaVerifier.current.clear();
      }
    };
  }, []);

  // Fermer le dropdown quand on clique ailleurs
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(event.target as Node)) {
        setIsCountryDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError(null);
  };

  const handleCountrySelect = (country: typeof countries[0]) => {
    setSelectedCountry(country);
    setIsCountryDropdownOpen(false);
  };

  const handleSendCode = async () => {
    if (!formData.firstName || !formData.lastName) {
      setError('Veuillez remplir votre nom et prénom');
      return;
    }

    if (!formData.phone || formData.phone.length < 8) {
      setError('Veuillez entrer un numéro de téléphone valide');
      return;
    }

    if (formData.password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    // Nettoyer le numéro de téléphone (enlever le 0 initial si présent)
    const cleanPhone = formData.phone.replace(/^0+/, '');
    const fullPhoneNumber = `${selectedCountry.dialCode}${cleanPhone}`;

    if (!isValidPhoneNumber(fullPhoneNumber)) {
      setError('Numéro de téléphone invalide pour ce pays');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      let appVerifier = recaptchaVerifier.current;

      if (!appVerifier) {
        // En développement, on peut désactiver la vérification pour les numéros de test
        if (process.env.NODE_ENV === 'development') {
          auth.settings.appVerificationDisabledForTesting = true;
          // Créer un verifier factice pour satisfaire TypeScript sans déclencher le widget
          // Note: Cela ne fonctionnera QUE pour les numéros de test enregistrés dans Firebase Console
          appVerifier = {
            verify: () => Promise.resolve('dummy-token'),
            type: 'invisible',
            clear: () => {},
          } as any;
        } else {
          appVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
            size: 'invisible',
          });
          recaptchaVerifier.current = appVerifier;
        }
      }

      const confirmation = await signInWithPhoneNumber(
        auth,
        fullPhoneNumber,
        appVerifier!
      );
      
      setVerificationId(confirmation.verificationId);
      setSuccess(`Code de vérification envoyé au ${fullPhoneNumber}`);
    } catch (error: unknown) {
      // Ne pas clear le recaptcha en cas d'erreur pour permettre le retry
      // si c'est une erreur liée au captcha, on le reset
      if (error instanceof Error && error.message.includes('reCAPTCHA')) {
        if (recaptchaVerifier.current && typeof recaptchaVerifier.current.clear === 'function') {
          try {
            recaptchaVerifier.current.clear();
          } catch (e) {
            // Ignorer si déjà clear
          }
          recaptchaVerifier.current = null;
        }
      }
      handleAuthError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!code || code.length < 6) {
      setError('Veuillez entrer le code complet');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (!verificationId) throw new Error('Aucun ID de vérification disponible');

      const credential = PhoneAuthProvider.credential(verificationId, code);
      const userCredential = await signInWithCredential(auth, credential);
      await createUserDocument(userCredential.user);
      router.push('/dashboard');
    } catch (error: unknown) {
      handleAuthError(error);
    } finally {
      setLoading(false);
    }
  };

  const createUserDocument = async (user: { uid: string; phoneNumber?: string | null }) => {
    const userDocRef = doc(db, 'users', user.uid);
    const docSnapshot = await getDoc(userDocRef);

    if (!docSnapshot.exists()) {
      await setDoc(userDocRef, {
        phoneNumber: user.phoneNumber || null,
        email: null,
        firstName: formData.firstName,
        lastName: formData.lastName,
        userType: 'client',
        createdAt: new Date(),
        updatedAt: new Date(),
        profileImageUrl: '',
        country: selectedCountry.code
      });
    }
  };

  const handleReset = () => {
    if (recaptchaVerifier.current) {
      recaptchaVerifier.current.clear();
      recaptchaVerifier.current = null;
    }
    setVerificationId(null);
    setCode('');
    setError(null);
    setSuccess(null);
  };

  const handleAuthError = async (error: unknown) => {
    const err = error as { code?: string; message?: string; stack?: string };
    let errorMessage = "Une erreur est survenue";

    // Envoi de l'erreur au serveur pour le debugging
    try {
      await fetch('/api/debug/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: err.message || "Unknown error",
          code: err.code || "UNKNOWN_CODE",
          stack: err.stack,
          context: 'RegisterPhoneContent'
        }),
      });
    } catch (e) {
      // Ignorer les erreurs de log
    }
    
    switch (err.code) {
      case AuthErrorCodes.TOO_MANY_ATTEMPTS_TRY_LATER:
        errorMessage = "Trop de tentatives. Veuillez réessayer plus tard.";
        break;
      case AuthErrorCodes.INVALID_PHONE_NUMBER:
        errorMessage = "Numéro de téléphone invalide";
        break;
      case 'auth/invalid-verification-code':
        errorMessage = "Code de vérification invalide";
        break;
      case AuthErrorCodes.NETWORK_REQUEST_FAILED:
        errorMessage = "Problème de connexion. Vérifiez votre réseau.";
        break;
      case 'auth/invalid-app-credential':
        errorMessage = "Configuration invalide. Vérifiez que localhost est autorisé dans la console Firebase et que la clé API est correcte.";
        break;
      default:
        errorMessage = err.message || "Erreur d'authentification";
    }

    setError(errorMessage);
    console.error("Erreur d'authentification:", error);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f29200] to-[#f29200] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-[#101010] px-6 py-4">
            <Link href="/login" className="inline-flex items-center text-white hover:text-[#f29200] transition-colors">
              <FiArrowLeft className="mr-2" />
              Retour
            </Link>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-[#101010] mb-2">
                Inscription Client
              </h1>
              <p className="text-sm text-gray-600">
                Inscrivez-vous avec votre numéro de téléphone
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className="bg-green-50 border-l-4 border-green-500 p-4">
                <p className="text-sm text-green-700">{success}</p>
              </div>
            )}

            {!verificationId ? (
              <div className="space-y-4">
                {/* Prénom */}
                <div>
                  <label className="block text-sm font-medium text-[#101010] mb-1">
                    Prénom *
                  </label>
                  <input
                    type="text"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                    className="w-full rounded-md border border-gray-300 p-3 focus:ring-2 focus:ring-[#f29200] focus:border-[#f29200]"
                    placeholder="Jean"
                    required
                  />
                </div>

                {/* Nom */}
                <div>
                  <label className="block text-sm font-medium text-[#101010] mb-1">
                    Nom *
                  </label>
                  <input
                    type="text"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleChange}
                    className="w-full rounded-md border border-gray-300 p-3 focus:ring-2 focus:ring-[#f29200] focus:border-[#f29200]"
                    placeholder="Dupont"
                    required
                  />
                </div>

                {/* Numéro de téléphone */}
                <div>
                  <label className="block text-sm font-medium text-[#101010] mb-1">
                    Numéro de téléphone *
                  </label>
                  <div className="flex">
                    {/* Sélecteur de pays */}
                    <div className="relative" ref={countryDropdownRef}>
                      <button
                        type="button"
                        onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
                        className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#f29200] h-[48px]"
                      >
                        <span className="mr-2 text-lg">{selectedCountry.flag}</span>
                        <span className="text-sm">{selectedCountry.dialCode}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="ml-1 h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>

                      {isCountryDropdownOpen && (
                        <div className="absolute z-10 mt-1 w-64 max-h-60 overflow-y-auto bg-white border border-gray-300 rounded-md shadow-lg">
                          <div className="py-1">
                            {countries.map((country) => (
                              <button
                                key={country.code}
                                type="button"
                                onClick={() => handleCountrySelect(country)}
                                className={`flex items-center w-full px-4 py-2 text-sm text-left hover:bg-gray-100 ${
                                  selectedCountry.code === country.code ? 'bg-[#f29200] text-white hover:bg-[#e68600]' : 'text-gray-700'
                                }`}
                              >
                                <span className="text-lg mr-3">{country.flag}</span>
                                <span className="font-medium mr-2">{country.dialCode}</span>
                                <span className="text-gray-600">{country.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '').slice(0, 15);
                        setFormData({ ...formData, phone: value });
                        setError(null);
                      }}
                      className="flex-1 rounded-r-md border border-gray-300 p-3 focus:ring-2 focus:ring-[#f29200] focus:border-[#f29200] h-[48px]"
                      placeholder={selectedCountry.defaultNumber}
                      required
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Pays sélectionné: {selectedCountry.name} {selectedCountry.flag} • Exemple: {selectedCountry.defaultNumber}
                  </p>
                </div>

                {/* Mot de passe */}
                <div>
                  <label className="block text-sm font-medium text-[#101010] mb-1">
                    Mot de passe *
                  </label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    className="w-full rounded-md border border-gray-300 p-3 focus:ring-2 focus:ring-[#f29200] focus:border-[#f29200]"
                    placeholder="•••••••"
                    required
                  />
                </div>

                {/* Confirmer mot de passe */}
                <div>
                  <label className="block text-sm font-medium text-[#101010] mb-1">
                    Confirmer le mot de passe *
                  </label>
                  <input
                    type="password"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="w-full rounded-md border border-gray-300 p-3 focus:ring-2 focus:ring-[#f29200] focus:border-[#f29200]"
                    placeholder="•••••••"
                    required
                  />
                </div>

                {/* Bouton envoyer le code */}
                <button
                  onClick={handleSendCode}
                  disabled={loading}
                  className="w-full bg-[#f29200] hover:bg-[#e68600] text-white font-bold py-3 px-4 rounded-md transition flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Envoi en cours...
                    </>
                  ) : (
                    'Envoyer le code de vérification'
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#101010] mb-1">
                    Code de vérification (6 chiffres)
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '');
                      setCode(value.slice(0, 6));
                      setError(null);
                    }}
                    className="w-full rounded-md border border-gray-300 p-3 text-[#101010] placeholder-gray-400 bg-white focus:ring-2 focus:ring-[#f29200] focus:border-[#f29200]"
                    placeholder="123456"
                    maxLength={6}
                  />
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={handleVerifyCode}
                    disabled={loading}
                    className="flex-1 bg-[#101010] hover:bg-[#000000] text-white font-bold py-3 px-4 rounded-md transition flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Vérification...
                      </>
                    ) : (
                      'Créer mon compte'
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={loading}
                    className="px-4 py-3 border border-gray-300 rounded-md text-[#101010] hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Annuler
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleSendCode}
                  className="text-sm text-[#f29200] hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={loading}
                >
                  Renvoyer le code
                </button>
              </div>
            )}

            {/* Lien vers inscription par email */}
            <div className="text-center pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                Vous préférez vous inscrire par email ?{' '}
                <Link href="/auth/register" className="text-[#f29200] hover:underline font-medium">
                  Inscription par email
                </Link>
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 text-center">
          <p className="text-xs text-white/80">
            En vous inscrivant, vous acceptez nos Conditions d'utilisation et Politique de confidentialité
          </p>
        </div>

        {/* Recaptcha container always rendered for persistence */}
        <div id="recaptcha-container"></div>
      </div>
    </div>
  );
}
