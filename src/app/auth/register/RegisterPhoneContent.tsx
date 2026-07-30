"use client";
import { useState, useEffect, useRef, useId } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { InputField } from '@/components/forms';
import { isValidPhoneNumber } from '@/lib/validation';
import { SUPPORTED_COUNTRIES, ERROR_MESSAGES } from '@/utils/constants';
import { getErrorMessage, getErrorCode } from '@/utils/error-utils';
import {
  startTwilioPhoneVerification,
  verifyTwilioPhoneCodeAndSignIn,
} from '@/services/auth.service';
import { cn } from '@/lib/utils';
import {
  driverFieldLabelClassName,
  driverPrimaryButtonClassName,
  driverSecondaryButtonClassName,
} from '@/app/driver/register/components/driverOnboardingStyles';

type FieldErrors = Partial<Record<'fullName' | 'phone', string>>;

const splitFullName = (fullName: string) => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  };
};

export default function RegisterPhoneContent() {
  const router = useRouter();
  const phoneInputId = useId();
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
  });
  const [code, setCode] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(SUPPORTED_COUNTRIES[0]);
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const [verificationPhone, setVerificationPhone] = useState<string | null>(null);
  const [maskedVerificationPhone, setMaskedVerificationPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const countryDropdownRef = useRef<HTMLDivElement>(null);

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
    setFieldErrors((current) => ({ ...current, [e.target.name]: undefined }));
  };

  const handleCountrySelect = (country: typeof SUPPORTED_COUNTRIES[0]) => {
    setSelectedCountry(country);
    setIsCountryDropdownOpen(false);
    setError(null);
    setFieldErrors((current) => ({ ...current, phone: undefined }));
  };

  const handleSendCode = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    const nextFieldErrors: FieldErrors = {};
    const nameParts = splitFullName(formData.fullName);
    if (!formData.fullName.trim()) {
      nextFieldErrors.fullName = 'Nom complet requis';
    } else if (!nameParts.lastName) {
      nextFieldErrors.fullName = 'Entrez votre nom et prénom';
    }
    if (!formData.phone.trim()) nextFieldErrors.phone = 'Numéro de téléphone requis';

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setError('Vérifiez les champs obligatoires.');
      return;
    }

    // Nettoyer le numéro de téléphone (enlever le 0 initial si présent)
    const cleanPhone = formData.phone.replace(/^0+/, '');
    const fullPhoneNumber = `${selectedCountry.dialCode}${cleanPhone}`;

    // Mapping des longueurs attendues par indicatif pays (dérivé de SUPPORTED_COUNTRIES)
    const countryLengths: Record<string, number> = Object.fromEntries(
      SUPPORTED_COUNTRIES.map(c => [c.dialCode, c.phoneLength])
    );

    if (!isValidPhoneNumber(fullPhoneNumber, selectedCountry.dialCode)) {
      const expectedLength = countryLengths[selectedCountry.dialCode] || 9;
      setFieldErrors({ phone: `Utilisez ${expectedLength} chiffres après ${selectedCountry.dialCode}` });
      setError(`Numéro invalide pour ${selectedCountry.name}.`);
      return;
    }

    setFieldErrors({});
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await startTwilioPhoneVerification(fullPhoneNumber);

      setVerificationPhone(result.phoneNumber);
      setMaskedVerificationPhone(result.maskedPhone);
      setSuccess(`Demande de code envoyée à ${result.maskedPhone}`);
    } catch (error: unknown) {
      handleAuthError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    if (!code || code.length < 6) {
      setError('Veuillez entrer le code complet');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (!verificationPhone) throw new Error('Aucun numéro en attente de vérification');

      const nameParts = splitFullName(formData.fullName);
      await verifyTwilioPhoneCodeAndSignIn({
        phoneNumber: verificationPhone,
        code,
        profile: {
          firstName: nameParts.firstName,
          lastName: nameParts.lastName,
          country: selectedCountry.code,
        },
      });
      router.push('/auth/setup-payment');
    } catch (error: unknown) {
      handleAuthError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setVerificationPhone(null);
    setMaskedVerificationPhone(null);
    setCode('');
    setError(null);
    setSuccess(null);
  };

  const handleAuthError = (error: unknown) => {
    if (process.env.NODE_ENV === 'development') {
      console.error("Erreur d'authentification:", error);
    }

    let errorMessage = "Une erreur est survenue";
    const errorCode = getErrorCode(error);
    const errorMsg = getErrorMessage(error);

    switch (errorCode) {
      case 'functions/resource-exhausted':
        errorMessage = errorMsg || "Trop de tentatives. Veuillez réessayer plus tard.";
        break;
      case 'functions/failed-precondition':
        errorMessage = errorMsg || "Le service SMS n'est pas encore prêt pour ce numéro.";
        break;
      case 'functions/invalid-argument':
      case 'auth/invalid-phone-number':
        errorMessage = ERROR_MESSAGES.INVALID_PHONE;
        break;
      case 'auth/invalid-verification-code':
      case 'functions/permission-denied':
        errorMessage = "Code de vérification invalide";
        break;
      case 'functions/unavailable':
      case 'auth/network-request-failed':
        errorMessage = ERROR_MESSAGES.NETWORK_ERROR;
        break;
      case 'functions/internal':
        errorMessage = "Le service SMS est temporairement indisponible. Vérifiez la configuration Twilio et réessayez.";
        break;
      default:
        if (errorMsg && !errorMsg.includes('Firebase')) {
          errorMessage = errorMsg;
        } else {
          errorMessage = "Une erreur est survenue lors de l'authentification. Veuillez réessayer.";
        }
    }

    setError(errorMessage);
  };

  return (
    <div className="min-h-screen bg-background font-sans text-slate-100 antialiased">
      <div className="relative flex min-h-screen w-full flex-col max-w-[430px] mx-auto overflow-hidden">
        <div className="h-12 w-full" />

        <div className="px-6">
          <Link href="/auth/role" className="inline-flex items-center text-slate-400 hover:text-primary transition-colors">
            <MaterialIcon name="arrow_back" size="md" className="mr-2" />
              Retour
            </Link>
        </div>

        <div className="flex flex-col items-center justify-center pt-6 pb-8">
          <div className="bg-primary/10 p-3 rounded-xl mb-3">
            <MaterialIcon name="local_taxi" className="text-primary text-[32px] font-bold" />
          </div>
          <h2 className="text-primary text-2xl font-bold tracking-tight">Medjira</h2>
        </div>

        <div className="px-6 text-center">
          <h1 className="text-white text-[28px] font-bold leading-tight mb-2">Créer un compte</h1>
          <p className="text-slate-400 text-base font-normal">Inscription rapide par téléphone</p>
        </div>

        {error && (
          <div className="mx-6 mt-6 p-3 bg-destructive/10 border border-destructive/30 rounded-xl flex items-start gap-2">
            <MaterialIcon name="error" size="md" className="text-destructive mt-0.5" />
            <span className="text-destructive text-sm">{error}</span>
          </div>
        )}

        {success && (
          <div className="mx-6 mt-6 p-3 bg-green-500/10 border border-green-500/30 rounded-xl flex items-start gap-2">
            <MaterialIcon name="check_circle" size="md" className="text-green-400 mt-0.5" />
            <span className="text-green-400 text-sm">{success}</span>
          </div>
        )}

        {!verificationPhone ? (
          <form onSubmit={handleSendCode} aria-label="Inscription par téléphone" className="mt-8 px-6 space-y-4" noValidate>
            <InputField
              label="Nom complet"
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              placeholder="Jean Dupont"
              autoComplete="name"
              error={fieldErrors.fullName}
              required
            />

            <div className="space-y-2" ref={countryDropdownRef}>
              <label htmlFor={phoneInputId} className={cn(driverFieldLabelClassName, 'block')}>
                Numéro de téléphone
                <span className="text-red-500 ml-1">*</span>
              </label>
              <div className="glass-input autofill-dark flex h-14 overflow-hidden rounded-xl border border-white/[0.08] bg-[#1A1A1A] text-white shadow-sm transition-all duration-200 focus-within:border-[#f29200] focus-within:ring-2 focus-within:ring-[#f29200]">
                <button
                  type="button"
                  onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
                  aria-label={`Indicatif ${selectedCountry.name} ${selectedCountry.dialCode}`}
                  aria-haspopup="listbox"
                  aria-expanded={isCountryDropdownOpen}
                  className="flex h-full shrink-0 items-center gap-2 border-r border-white/[0.08] px-3 text-sm font-semibold text-white outline-none transition-colors hover:bg-white/[0.04] focus:bg-white/[0.04]"
                >
                  <span>{selectedCountry.code}</span>
                  <span className="text-slate-300">{selectedCountry.dialCode}</span>
                  <MaterialIcon name="expand_more" size="sm" className="text-slate-400" />
                </button>
                <input
                  id={phoneInputId}
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 15);
                    setFormData({ ...formData, phone: value });
                    setError(null);
                    setFieldErrors((current) => ({ ...current, phone: undefined }));
                  }}
                  placeholder={selectedCountry.defaultNumber}
                  inputMode="tel"
                  autoComplete="tel-national"
                  aria-invalid={fieldErrors.phone ? 'true' : undefined}
                  aria-describedby={fieldErrors.phone ? `${phoneInputId}-error` : `${phoneInputId}-helper`}
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
                        onClick={() => handleCountrySelect(country)}
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

              {fieldErrors.phone ? (
                <p id={`${phoneInputId}-error`} className="mt-1 text-sm text-red-500 flex items-center">
                  {fieldErrors.phone}
                </p>
              ) : (
                <p id={`${phoneInputId}-helper`} className="mt-1 text-sm text-slate-400">
                  Exemple: {selectedCountry.defaultNumber}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className={driverPrimaryButtonClassName}
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Envoi en cours...
                </>
              ) : (
                'Envoyer le code de vérification'
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} aria-label="Vérification du téléphone" className="mt-8 px-6 space-y-4">
            <InputField
              label="Code de vérification (6 chiffres)"
              type="text"
              value={code}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '');
                setCode(value.slice(0, 6));
                setError(null);
              }}
              icon={<MaterialIcon name="pin" size="md" />}
              placeholder="123456"
              maxLength={6}
              inputMode="numeric"
              autoComplete="one-time-code"
            />

            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={loading}
                className={cn(driverPrimaryButtonClassName, 'flex-1')}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
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
                className={cn(driverSecondaryButtonClassName, 'w-auto px-4 rounded-2xl')}
              >
                Changer le numéro
              </button>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
              <p className="font-semibold text-white">Vous n'avez rien reçu ?</p>
              <p className="mt-1 text-slate-400">
                Le SMS peut prendre jusqu'à une minute. Vérifiez le réseau, le numéro saisi et les SMS bloqués avant de renvoyer.
              </p>
              {maskedVerificationPhone && (
                <p className="mt-2 text-xs text-slate-500">
                  Code envoyé à {maskedVerificationPhone}
                </p>
              )}
              <button
                type="button"
                onClick={() => void handleSendCode()}
                className="mt-3 text-sm font-bold text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loading}
              >
                Renvoyer le code
              </button>
            </div>
          </form>
            )}

        <div className="mt-auto pb-10 pt-8 text-center">
          <p className="text-slate-400 text-sm">
            Vous avez déjà un compte ?
            <Link href="/login" className="text-primary font-bold ml-1 hover:underline">
              Se connecter
            </Link>
          </p>
        </div>

        <div className="px-6 pb-4 text-center">
          <p className="text-xs text-white/80">
            En vous inscrivant, vous acceptez nos Conditions d'utilisation et Politique de confidentialité
          </p>
        </div>

      </div>
    </div>
  );
}
