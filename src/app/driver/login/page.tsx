"use client";
import { useState } from 'react';
import { auth, db } from '../../../config/firebase';
import {
  signInWithEmailAndPassword
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthService } from '@/services';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { ERROR_MESSAGES } from '@/utils/constants';

export default function DriverLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError(ERROR_MESSAGES.REQUIRED_FIELDS);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);

      // Vérifier si l'email est vérifié
      if (!userCredential.user.emailVerified) {
        setError('Veuillez vérifier votre adresse email avant de vous connecter. Vérifiez votre boîte de réception ou renvoyez l\'email de vérification.');
        await auth.signOut();
        return;
      }

      await verifyDriverAccount(userCredential.user.uid);
    } catch (error: unknown) {
      // Si l'utilisateur est connecté mais verifyDriverAccount a échoué,
      // le déconnecter pour éviter un état authentifié en arrière-plan
      if (auth.currentUser) {
        await auth.signOut().catch(() => {});
      }
      const message = error instanceof Error ? error.message : "Erreur de connexion";
      if (!message.includes('Veuillez vérifier votre adresse email')) {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const verifyDriverAccount = async (uid: string) => {
    const driverDoc = await getDoc(doc(db, 'drivers', uid));

    // Si aucun profil chauffeur n'existe encore, rediriger vers l'inscription chauffeur
    if (!driverDoc.exists()) {
      router.push('/driver/register');
      return;
    }

    const driverData = driverDoc.data();
    if (driverData.status !== 'approved') {
      throw new Error("Votre compte n'est pas encore approuvé");
    }

    router.push('/driver/dashboard');
  };

  const handleGoogleLogin = async () => {
    try {
      const user = await AuthService.signInWithGoogleForDriver();
      await verifyDriverAccount(user.uid);
    } catch (error: unknown) {
      if (auth.currentUser) {
        await auth.signOut().catch(() => {});
      }
      setError(error instanceof Error ? error.message : "Erreur de connexion Google");
    }
  };

  return (
    <div className="min-h-screen bg-background font-sans text-slate-100 antialiased">
      <div className="relative flex min-h-screen w-full flex-col max-w-[430px] mx-auto overflow-hidden">
        {/* Top Safe Area */}
        <div className="h-12 w-full" />

        {/* Brand Logo */}
        <div className="flex flex-col items-center justify-center pt-8 pb-10">
          <div className="bg-primary/10 p-3 rounded-xl mb-3">
            <MaterialIcon name="local_taxi" className="text-primary text-[32px] font-bold" />
          </div>
          <h2 className="text-primary text-2xl font-bold tracking-tight">Medjira</h2>
          <span className="text-slate-500 text-sm mt-1">Espace Chauffeur</span>
        </div>

        {/* Heading */}
        <div className="px-6 text-center">
          <h1 className="text-white text-[32px] font-bold leading-tight mb-2">Bienvenue !</h1>
          <p className="text-slate-400 text-base font-normal">Connectez-vous à votre compte professionnel</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-6 mt-6 p-3 bg-destructive/10 border border-destructive/30 rounded-xl flex items-start gap-2">
            <MaterialIcon name="error" size="md" className="text-destructive mt-0.5" />
            <span className="text-destructive text-sm">{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleEmailLogin} className="mt-10 px-6 space-y-4">
          {/* Email */}
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <MaterialIcon name="mail" size="md" className="text-slate-500" />
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              className="glass-input w-full h-14 pl-12 pr-4 rounded-xl text-white text-base placeholder:text-slate-500 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
              placeholder="Votre email"
              required
              autoComplete="email"
            />
          </div>

          {/* Password */}
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <MaterialIcon name="lock" size="md" className="text-slate-500" />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              className="glass-input w-full h-14 pl-12 pr-12 rounded-xl text-white text-base placeholder:text-slate-500 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
              placeholder="Mot de passe"
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-4 flex items-center"
            >
              <MaterialIcon
                name={showPassword ? 'visibility_off' : 'visibility'}
                size="md"
                className="text-slate-500"
              />
            </button>
          </div>

          {/* Forgot Password */}
          <div className="flex justify-end pt-1">
            <Link href="/driver/reset-password" className="text-primary text-sm font-semibold hover:underline">
              Mot de passe oublié ?
            </Link>
          </div>

          {/* CTA Button */}
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
                  Connexion...
                </>
              ) : (
                'Se connecter'
              )}
            </button>
          </div>
        </form>

        {/* Divider */}
        <div className="flex items-center px-6 my-10 space-x-4">
          <div className="flex-1 h-[1px] bg-slate-800" />
          <span className="text-slate-500 text-sm font-medium">ou continuer avec</span>
          <div className="flex-1 h-[1px] bg-slate-800" />
        </div>

        {/* Google Login */}
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

        {/* Footer */}
        <div className="mt-auto pb-10 pt-6 text-center space-y-3">
          <p className="text-slate-400 text-sm">
            Pas de compte chauffeur ?
            <Link href="/driver/register" className="text-primary font-bold ml-1 hover:underline">
              Devenir chauffeur
            </Link>
          </p>
          <p className="text-slate-500 text-xs">
            Vous êtes client ?{' '}
            <Link href="/login" className="text-primary font-medium hover:underline">
              Espace client
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
