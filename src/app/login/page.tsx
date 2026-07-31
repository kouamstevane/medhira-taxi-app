"use client";

import { useEffect, useId, useRef, useState } from 'react';
import { auth, db } from '@/config/firebase';
import {
  AuthErrorCodes,
  signOut,
} from 'firebase/auth';
import { getDoc, doc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { AuthService } from '@/services';
import {
  startTwilioPhoneVerification,
  verifyTwilioPhoneCodeAndSignIn,
} from '@/services/auth.service';
import {
  getRouteForAuthenticatedProfile,
  toRestaurantEffectiveStatus,
  type DriverStatus,
} from '@/services/roles.service';
import type { UserData } from '@/types/user';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { ERROR_MESSAGES, SUPPORTED_COUNTRIES } from '@/utils/constants';
import { isValidPhoneNumber } from '@/lib/validation';

export default function LoginPage() {
  const phoneInputId = useId();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(SUPPORTED_COUNTRIES[0]);
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const [verificationPhone, setVerificationPhone] = useState<string | null>(null);
  const [maskedVerificationPhone, setMaskedVerificationPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { authStatus, userData } = useAuth();
  const router = useRouter();
  const countryDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(event.target as Node)) {
        setIsCountryDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (authStatus !== 'authenticated' || !userData) return;

    const route = getRouteForAuthenticatedProfile(userData, {});
    if (!route) {
      void signOut(auth);
      return;
    }

    router.replace(route);
  }, [authStatus, router, userData]);

  const routeAuthenticatedUser = async (uid: string) => {
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (!userSnap.exists()) {
      await signOut(auth);
      setError("Votre session est incomplète. Reconnectez-vous ou recréez votre profil.");
      return;
    }
    const userData = userSnap.data() as UserData;

    const driverSnap = userData.roles?.driver
      ? await getDoc(doc(db, 'drivers', uid))
      : null;
    const restaurantId = userData.roles?.restaurant?.restaurantId;
    const restaurantSnap = restaurantId
      ? await getDoc(doc(db, 'restaurants', restaurantId))
      : null;

    const driverStatus = driverSnap?.data()?.status as DriverStatus | undefined;
    const restaurantStatus = toRestaurantEffectiveStatus(restaurantSnap?.data());

    const route = getRouteForAuthenticatedProfile(userData, {
      driver: driverStatus,
      restaurant: restaurantStatus,
    });
    if (!route) {
      await signOut(auth);
      setError("Votre session est incomplète. Reconnectez-vous ou recréez votre profil.");
      return;
    }

    router.replace(route);
  };

  const buildPhoneNumber = () => {
    const cleanPhone = phone.replace(/\D/g, '').replace(/^0+/, '');
    return `${selectedCountry.dialCode}${cleanPhone}`;
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phone.trim()) {
      setError('Numéro de téléphone requis');
      return;
    }

    const fullPhoneNumber = buildPhoneNumber();
    if (!isValidPhoneNumber(fullPhoneNumber, selectedCountry.dialCode)) {
      setError(`Numéro invalide pour ${selectedCountry.name}.`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await startTwilioPhoneVerification(fullPhoneNumber);
      setVerificationPhone(result.phoneNumber);
      setMaskedVerificationPhone(result.maskedPhone);
    } catch (err: unknown) {
      handleAuthError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!verificationPhone) {
      setError('Aucun numéro en attente de vérification');
      return;
    }

    if (!code || code.length < 6) {
      setError('Veuillez entrer le code complet');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await verifyTwilioPhoneCodeAndSignIn({
        phoneNumber: verificationPhone,
        code,
      });
      await routeAuthenticatedUser(result.uid);
    } catch (err: unknown) {
      handleAuthError(err);
      setLoading(false);
    }
  };

  const handleResetPhone = () => {
    setVerificationPhone(null);
    setMaskedVerificationPhone(null);
    setCode('');
    setError(null);
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await AuthService.signInWithGoogle();
      await routeAuthenticatedUser(user.uid);
    } catch (err: unknown) {
      handleAuthError(err);
      setLoading(false);
    }
  };

  const handleAuthError = (error: unknown) => {
    const err = error as { code?: string; message?: string };
    let errorMessage = "Une erreur est survenue";

    switch (err.code) {
      case AuthErrorCodes.TOO_MANY_ATTEMPTS_TRY_LATER:
      case 'functions/resource-exhausted':
        errorMessage = err.message || "Trop de tentatives. Veuillez réessayer plus tard.";
        break;
      case 'functions/invalid-argument':
        errorMessage = err.message === 'Nom complet requis.'
          ? "Ce numéro n'est pas encore inscrit. Créez un compte pour continuer."
          : err.message || ERROR_MESSAGES.INVALID_PHONE;
        break;
      case 'auth/invalid-verification-code':
      case 'functions/permission-denied':
        errorMessage = 'Code de vérification invalide';
        break;
      case AuthErrorCodes.NETWORK_REQUEST_FAILED:
      case 'functions/unavailable':
        errorMessage = ERROR_MESSAGES.NETWORK_ERROR;
        break;
      case 'auth/popup-closed-by-user':
        errorMessage = "Connexion Google annulée";
        break;
      case 'functions/internal':
        errorMessage = "Le service SMS est temporairement indisponible. Réessayez.";
        break;
      default:
        errorMessage = err.message || ERROR_MESSAGES.AUTH_ERROR;
    }

    setError(errorMessage);
    console.error("Erreur d'authentification:", error);
  };

  return (
    <div className="min-h-screen bg-background font-sans text-slate-100 antialiased">
      <div className="relative flex min-h-screen w-full flex-col max-w-[375px] mx-auto overflow-hidden">
        <div className="h-12 w-full" />

        <div className="flex flex-col items-center justify-center pt-8 pb-10">
          <div className="bg-primary/10 p-3 rounded-xl mb-3">
            <MaterialIcon name="local_taxi" className="text-primary text-[32px] font-bold" />
          </div>
          <h2 className="text-primary text-2xl font-bold tracking-tight">Medjira</h2>
        </div>

        <div className="px-6 text-center">
          <h1 className="text-white text-[32px] font-bold leading-tight mb-2">Bon retour !</h1>
          <p className="text-slate-400 text-base font-normal">Connectez-vous pour continuer</p>
        </div>

        {error && (
          <div className="mx-6 mt-6 p-3 bg-destructive/10 border border-destructive/30 rounded-xl flex items-start gap-2">
            <MaterialIcon name="error" size="md" className="text-destructive mt-0.5" />
            <span className="text-destructive text-sm">{error}</span>
          </div>
        )}

        {!verificationPhone ? (
          <form onSubmit={handleSendCode} aria-label="Connexion par téléphone" className="mt-10 px-6 space-y-4" noValidate>
            <p className="text-center text-sm font-semibold text-white">Connexion par téléphone</p>

            <div className="space-y-2" ref={countryDropdownRef}>
              <label htmlFor={phoneInputId} className="block text-sm font-medium text-slate-400">
                Numéro de téléphone
              </label>
              <div className="glass-input flex h-14 overflow-hidden rounded-xl border border-white/[0.08] bg-[#1A1A1A] text-white transition-all focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
                <button
                  type="button"
                  onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
                  aria-label={`Indicatif ${selectedCountry.name} ${selectedCountry.dialCode}`}
                  aria-haspopup="listbox"
                  aria-expanded={isCountryDropdownOpen}
                  className="flex h-full shrink-0 items-center gap-2 border-r border-white/[0.08] px-3 text-sm font-semibold text-white outline-none transition-colors hover:bg-white/[0.04]"
                >
                  <span>{selectedCountry.code}</span>
                  <span className="text-slate-300">{selectedCountry.dialCode}</span>
                  <MaterialIcon name="expand_more" size="sm" className="text-slate-400" />
                </button>
                <input
                  id={phoneInputId}
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value.replace(/\D/g, '').slice(0, 15));
                    setError(null);
                  }}
                  placeholder={selectedCountry.defaultNumber}
                  inputMode="tel"
                  autoComplete="tel-national"
                  className="h-full min-w-0 flex-1 bg-transparent px-4 text-base text-white outline-none placeholder:text-slate-500"
                  required
                />
              </div>

              {isCountryDropdownOpen && (
                <div role="listbox" aria-label="Pays disponibles" className="mt-2 w-full max-h-56 overflow-y-auto glass-card border border-white/10 rounded-xl shadow-xl">
                  <div className="py-1">
                    {SUPPORTED_COUNTRIES.map((country) => (
                      <button
                        key={country.code}
                        type="button"
                        role="option"
                        aria-selected={selectedCountry.code === country.code}
                        onClick={() => {
                          setSelectedCountry(country);
                          setIsCountryDropdownOpen(false);
                          setError(null);
                        }}
                        className={`flex items-center w-full px-4 py-3 text-sm text-left hover:bg-white/10 ${
                          selectedCountry.code === country.code ? 'bg-primary/20 text-white' : 'text-slate-300'
                        }`}
                      >
                        <span className="font-semibold mr-3">{country.code}</span>
                        <span className="font-medium mr-2">{country.dialCode}</span>
                        <span className="text-slate-400">{country.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Envoi...
                  </>
                ) : (
                  'Envoyer le code'
                )}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} aria-label="Vérification du téléphone" className="mt-10 px-6 space-y-4">
            <div className="text-center">
              <p className="text-sm font-semibold text-white">Code de vérification</p>
              {maskedVerificationPhone && (
                <p className="mt-1 text-sm text-slate-400">SMS envoyé à {maskedVerificationPhone}</p>
              )}
            </div>

            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <MaterialIcon name="pin" size="md" className="text-slate-500" />
              </div>
              <input
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                  setError(null);
                }}
                className="glass-input w-full h-14 pl-12 pr-4 rounded-xl text-white text-base placeholder:text-slate-500 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
                placeholder="123456"
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
                required
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 h-14 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {loading ? 'Vérification...' : 'Se connecter'}
              </button>
              <button
                type="button"
                onClick={handleResetPhone}
                disabled={loading}
                className="h-14 px-4 glass-card border border-white/10 text-slate-300 font-medium rounded-2xl hover:bg-white/5 transition-all disabled:opacity-50"
              >
                Modifier
              </button>
            </div>
          </form>
        )}

        <div className="flex items-center px-6 my-10 space-x-4">
          <div className="flex-1 h-[1px] bg-slate-800" />
          <span className="text-slate-500 text-sm font-medium">ou continuer avec</span>
          <div className="flex-1 h-[1px] bg-slate-800" />
        </div>

        <div className="px-6">
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            type="button"
            className="glass-card w-full h-14 flex items-center justify-center gap-3 rounded-2xl active:scale-[0.98] transition-transform border border-white/10 disabled:opacity-50"
          >
            <svg fill="none" height="20" viewBox="0 0 24 24" width="20">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            <span className="text-white font-semibold">Continuer avec Google</span>
          </button>
        </div>

        <div className="mt-auto pb-10 text-center">
          <p className="text-slate-400 text-sm">
            Pas de compte ?
            <Link href="/auth/role" className="text-primary font-bold ml-1 hover:underline">
              Créer un compte
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
