"use client";
import { useState, useRef, useEffect } from 'react';
import { auth, db } from '../../config/firebase';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  PhoneAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  AuthErrorCodes,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthService } from '@/services';
import { FiArrowLeft } from 'react-icons/fi';

// Liste des pays supportés avec codes, drapeaux et formats de numéro par défaut
const countries = [
  { code: 'CM', dialCode: '+237', name: 'Cameroun', flag: '🇨🇲', defaultNumber: '655744484' },
  { code: 'FR', dialCode: '+33', name: 'France', flag: '🇫🇷', defaultNumber: '612345678' },
  { code: 'BE', dialCode: '+32', name: 'Belgique', flag: '🇧🇪', defaultNumber: '470123456' },
  { code: 'CA', dialCode: '+1', name: 'Canada', flag: '🇨🇦', defaultNumber: '5550123456' },
];

export default function LoginPage() {
  const [activeTab, setActiveTab] = useState<'phone' | 'email'>('phone');
  const [phone, setPhone] = useState(""); // Numéro par défaut du premier pays
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(countries[0]); // Cameroun par défaut
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const recaptchaVerifier = useRef<RecaptchaVerifier | null>(null);
  const countryDropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
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

  const handleSendCode = async () => {
    if (!phone || phone.length < 8) {
      setError('Veuillez entrer un numéro valide');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (!recaptchaVerifier.current) {
        recaptchaVerifier.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible',
        });
      }

      const fullPhoneNumber = `${selectedCountry.dialCode}${phone}`;
      const confirmation = await signInWithPhoneNumber(
        auth,
        fullPhoneNumber,
        recaptchaVerifier.current
      );
      
      setVerificationId(confirmation.verificationId);
      setSuccess(`Code de vérification envoyé au ${fullPhoneNumber}`);
    } catch (error: unknown) {
      handleAuthError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Veuillez remplir tous les champs');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      // Vérifier si l'email est vérifié
      if (!userCredential.user.emailVerified) {
        await auth.signOut();
        setError('Veuillez vérifier votre adresse email avant de vous connecter. Un email de vérification a été envoyé.');
        return;
      }
      
      router.push('/dashboard');
    } catch (error: unknown) {
      handleAuthError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await AuthService.signInWithGoogle();
      router.push('/dashboard');
    } catch (error: unknown) {
      handleAuthError(error);
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

  const createUserDocument = async (user: { uid: string; phoneNumber?: string | null; email?: string | null; photoURL?: string | null }) => {
    const userDocRef = doc(db, 'users', user.uid);
    const docSnapshot = await getDoc(userDocRef);

    if (!docSnapshot.exists()) {
      await setDoc(userDocRef, {
        phoneNumber: user.phoneNumber || null,
        email: user.email || null,
        createdAt: new Date(),
        updatedAt: new Date(),
        firstName: '',
        lastName: '',
        profileImageUrl: user.photoURL || '',
        country: selectedCountry.code
      });
    }
  };

  const handleAuthError = (error: unknown) => {
    const err = error as { code?: string; message?: string };
    let errorMessage = "Une erreur est survenue";
    
    switch (err.code) {
      case AuthErrorCodes.TOO_MANY_ATTEMPTS_TRY_LATER:
        errorMessage = "Trop de tentatives. Veuillez réessayer plus tard.";
        break;
      case AuthErrorCodes.INVALID_PHONE_NUMBER:
        errorMessage = "Numéro de téléphone invalide";
        break;
      case AuthErrorCodes.INVALID_EMAIL:
        errorMessage = "Email invalide";
        break;
      case AuthErrorCodes.USER_DELETED:
      case AuthErrorCodes.INVALID_PASSWORD:
        errorMessage = "Email ou mot de passe incorrect";
        break;
      case AuthErrorCodes.NETWORK_REQUEST_FAILED:
        errorMessage = "Problème de connexion. Vérifiez votre réseau.";
        break;
      default:
        errorMessage = err.message || "Erreur d'authentification";
    }

    setError(errorMessage);
    console.error("Erreur d'authentification:", error);
  };

  const handleReset = () => {
    setVerificationId(null);
    setCode('');
    setError(null);
    setSuccess(null);
    setPhone(selectedCountry.defaultNumber); // Réinitialiser avec le numéro par défaut du pays actuel
  };

  const handleCountrySelect = (country: typeof countries[0]) => {
    setSelectedCountry(country);
    setPhone(""); // Changer le numéro selon le pays sélectionné
    setIsCountryDropdownOpen(false);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#e6e6e6] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg overflow-hidden w-full max-w-md">
        {/* Header */}
        <div className="bg-[#101010] p-6 text-center relative">
          <Link 
            href="/"
            className="absolute left-4 top-6 inline-flex items-center text-white hover:text-[#f29200] transition-colors"
          >
            <FiArrowLeft className="text-xl" />
          </Link>
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-[#f29200] rounded-full flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1v-1a1 1 0 011-1h2a1 1 0 011 1v1a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H19a1 1 0 001-1V5a1 1 0 00-1-1H3zM3 5h2v2H3V5zm0 4h2v2H3V9zm0 4h2v2H3v-2zm12-8h2v2h-2V5zm0 4h2v2h-2V9zm0 4h2v2h-2v-2z" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white">Connexion à Medjira</h1>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Tabs */}
          <div className="flex border-b border-gray-200 mb-6">
            <button
              onClick={() => setActiveTab('phone')}
              className={`flex-1 py-2 font-medium text-sm ${activeTab === 'phone' ? 'text-[#f29200] border-b-2 border-[#f29200]' : 'text-gray-500'}`}
            >
              Téléphone
            </button>
            <button
              onClick={() => setActiveTab('email')}
              className={`flex-1 py-2 font-medium text-sm ${activeTab === 'email' ? 'text-[#f29200] border-b-2 border-[#f29200]' : 'text-gray-500'}`}
            >
              Email
            </button>
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-md flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {success}
            </div>
          )}

          {/* Phone Login */}
          {activeTab === 'phone' && (
            <>
              {!verificationId ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[#101010] mb-1">
                      Numéro de téléphone
                    </label>
                    <div className="flex">
                      {/* Sélecteur de pays */}
                      <div className="relative" ref={countryDropdownRef}>
                        <button
                          type="button"
                          onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
                          className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-[#f29200] h-[42px]"
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
                        value={phone}
                        onChange={(e) => {
                          setPhone(e.target.value.replace(/\D/g, ''));
                          setError(null);
                        }}
                        className="flex-1 rounded-r-md border border-gray-300 p-2 focus:ring-[#f29200] focus:border-[#f29200] h-[42px]"
                        placeholder={selectedCountry.defaultNumber}
                        maxLength={15}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Pays sélectionné: {selectedCountry.name} {selectedCountry.flag} • Exemple: {selectedCountry.defaultNumber}
                    </p>
                  </div>

                  <button
                    onClick={handleSendCode}
                    disabled={loading}
                    className="w-full bg-[#f29200] hover:bg-[#e68600] text-white font-bold py-3 px-4 rounded-md transition flex items-center justify-center"
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
                      'Envoyer le code'
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
                      className="w-full rounded-md border border-gray-300 p-2 text-[#101010] placeholder-gray-400 bg-white focus:ring-[#f29200] focus:border-[#f29200]"
                      placeholder="123456"
                      maxLength={6}
                    />
                  </div>

                  <div className="flex space-x-3">
                    <button
                      onClick={handleVerifyCode}
                      disabled={loading}
                      className="flex-1 bg-[#101010] hover:bg-[#000000] text-white font-bold py-3 px-4 rounded-md transition flex items-center justify-center"
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
                        'Se connecter'
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleReset}
                      disabled={loading}
                      className="px-4 py-3 border border-gray-300 rounded-md text-[#101010] hover:bg-gray-50"
                    >
                      Annuler
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleSendCode}
                    className="text-sm text-[#f29200] hover:underline"
                  >
                    Renvoyer le code
                  </button>
                </div>
              )}
            </>
          )}

          {/* Email Login */}
          {activeTab === 'email' && (
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#101010] mb-1">
                  Adresse email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  className="w-full rounded-md border border-gray-300 p-2 text-[#101010] placeholder-gray-400 bg-white focus:ring-[#f29200] focus:border-[#f29200]"
                  placeholder="votre@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#101010] mb-1">
                  Mot de passe
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  className="w-full rounded-md border border-gray-300 p-2 text-[#101010] placeholder-gray-400 bg-white focus:ring-[#f29200] focus:border-[#f29200]"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#f29200] hover:bg-[#e68600] text-white font-bold py-3 px-4 rounded-md transition flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Connexion...
                  </>
                ) : (
                  'Se connecter'
                )}
              </button>

              <div className="text-center">
                <Link href="/auth/reset-password" className="text-sm text-[#f29200] hover:underline">
                  Mot de passe oublié ?
                </Link>
              </div>

              {error && error.includes('vérifier votre adresse email') && (
                <div className="mt-4 text-center">
                  <Link
                    href="/auth/verify-email"
                    className="text-sm text-[#f29200] hover:underline font-medium"
                  >
                    Renvoyer l&apos;email de vérification
                  </Link>
                </div>
              )}
            </form>
          )}

          {/* Social Login */}
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Ou continuer avec</span>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <svg className="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Google
              </button>
            </div>
          </div>

          {/* Signup Link */}
          <div className="mt-6 text-center text-sm">
            <p className="text-gray-600">
              Vous n&apos;avez pas de compte ?{' '}
              <Link href="/auth/register" className="text-[#f29200] font-medium hover:underline">
                S&apos;inscrire
              </Link>
            </p>
            <p className="text-gray-500 mt-3 text-xs sm:text-sm">
              Vous êtes un chauffeur ?{' '}
              <Link href="/driver/login" className="text-[#f29200] font-medium hover:underline touch-manipulation" style={{ minHeight: '44px', display: 'inline-flex', alignItems: 'center' }}>
                Accéder à l&apos;espace chauffeur
              </Link>
            </p>
          </div>
        </div>

        <div id="recaptcha-container" className="hidden"></div>
      </div>
    </div>
  );
}