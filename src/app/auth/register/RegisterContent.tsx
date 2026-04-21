"use client";
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/config/firebase';
import { updateProfile } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { signUpWithEmail, signInWithGoogle } from '@/services/auth.service';
import Link from 'next/link';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { ERROR_MESSAGES } from '@/utils/constants';
import { isValidPassword } from '@/lib/validation';

export default function RegisterContent() {
    const router = useRouter();
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        confirmPassword: '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Flag pour empêcher le useEffect de rediriger pendant l'inscription
    const isRegisteringRef = useRef(false);

    // Rediriger si déjà connecté ET vérifié, sauf si une inscription est en cours
    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(async (user) => {
            // Ne pas rediriger si une inscription est en cours
            if (isRegisteringRef.current) return;

            if (user && user.emailVerified) {
                try {
                    const userDoc = await getDoc(doc(db, 'users', user.uid));
                    const userType = userDoc.exists() ? userDoc.data().userType : 'client';
                    if (userType === 'chauffeur') {
                        router.push('/driver/dashboard');
                    } else {
                        router.push('/auth/setup-payment');
                    }
                } catch {
                    router.push('/auth/setup-payment');
                }
            }
        });
        return () => unsubscribe();
    }, [router]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });
        setError(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Validation
        if (!formData.firstName || !formData.lastName || !formData.email || !formData.password) {
            setError(ERROR_MESSAGES.REQUIRED_FIELDS);
            return;
        }

        if (formData.password !== formData.confirmPassword) {
            setError('Les mots de passe ne correspondent pas');
            return;
        }

        if (!isValidPassword(formData.password)) {
            setError('Le mot de passe doit contenir au moins 8 caractères avec majuscule, minuscule et chiffre');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.email)) {
            setError(ERROR_MESSAGES.INVALID_EMAIL);
            return;
        }

        setLoading(true);
        isRegisteringRef.current = true;

        try {
            // Créer le compte avec email+password et créer le document Firestore
            const user = await signUpWithEmail(
                formData.email,
                formData.password,
                formData.firstName,
                formData.lastName,
                'client'
            );

            // Mettre à jour le profil Firebase Auth avec le nom complet
            await updateProfile(user, {
                displayName: `${formData.firstName} ${formData.lastName}`,
            });

            console.log(' Compte client créé avec succès:', user.uid);

            // Redirection vers la page de vérification email
            router.push('/auth/verify-email');
        } catch (err: unknown) {
            console.error('Erreur création compte:', err);

            const error = err as { code?: string; message?: string };
            if (error.code === 'auth/email-already-in-use') {
                setError('Cette adresse email est déjà utilisée');
            } else if (error.code === 'auth/invalid-email') {
                setError(ERROR_MESSAGES.INVALID_EMAIL);
            } else if (error.code === 'auth/weak-password') {
                setError('Mot de passe trop faible (minimum 6 caractères)');
            } else if (error.code === 'auth/network-request-failed') {
                setError('Erreur de connexion. Vérifiez votre connexion internet');
            } else {
                setError(error.message || 'Erreur lors de la création du compte');
            }
        } finally {
            setLoading(false);
            isRegisteringRef.current = false;
        }
    };

    const handleGoogleSignUp = async () => {
        setError(null);
        setLoading(true);
        isRegisteringRef.current = true;

        try {
            const user = await signInWithGoogle();
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            const userType = userDoc.exists() ? userDoc.data()?.userType : 'client';
            if (userType === 'chauffeur') {
                router.push('/driver/dashboard');
            } else {
                router.push('/auth/setup-payment');
            }
        } catch (err: unknown) {
            console.error('Erreur connexion Google:', err);
            const error = err as { code?: string; message?: string };

            if (error.code === 'auth/popup-closed-by-user' || error.message?.includes('cancelled')) {
                setError('Connexion annulée');
            } else if (error.code === 'auth/popup-blocked') {
                setError('Popup bloquée. Veuillez autoriser les popups pour ce site');
            } else if (error.code === 'auth/network-request-failed') {
                setError('Erreur de connexion. Vérifiez votre connexion internet');
            } else {
                setError(error.message || 'Erreur lors de la connexion avec Google');
            }
        } finally {
            setLoading(false);
            isRegisteringRef.current = false;
        }
    };

    return (
        <div className="min-h-screen bg-background font-sans text-slate-100 antialiased">
            <div className="relative flex min-h-screen w-full flex-col max-w-[430px] mx-auto overflow-hidden">
                {/* Top Safe Area */}
                <div className="h-12 w-full" />

                {/* Back Link */}
                <div className="px-6">
                    <Link
                        href="/"
                        className="inline-flex items-center text-slate-400 hover:text-primary transition-colors"
                    >
                        <MaterialIcon name="arrow_back" size="md" className="mr-2" />
                        Retour
                    </Link>
                </div>

                {/* Brand Logo */}
                <div className="flex flex-col items-center justify-center pt-6 pb-8">
                    <div className="bg-primary/10 p-3 rounded-xl mb-3">
                        <MaterialIcon name="local_taxi" className="text-primary text-[32px] font-bold" />
                    </div>
                    <h2 className="text-primary text-2xl font-bold tracking-tight">Medjira</h2>
                </div>

                {/* Heading */}
                <div className="px-6 text-center">
                    <h1 className="text-white text-[28px] font-bold leading-tight mb-2">Créer un compte</h1>
                    <p className="text-slate-400 text-base font-normal">Rejoignez Medjira dès aujourd&apos;hui</p>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mx-6 mt-6 p-3 bg-destructive/10 border border-destructive/30 rounded-xl flex items-start gap-2">
                        <MaterialIcon name="error" size="md" className="text-destructive mt-0.5" />
                        <span className="text-destructive text-sm">{error}</span>
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="mt-8 px-6 space-y-4">
                    {/* Prénom */}
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <MaterialIcon name="person" size="md" className="text-slate-500" />
                        </div>
                        <input
                            type="text"
                            name="firstName"
                            value={formData.firstName}
                            onChange={handleChange}
                            className="glass-input w-full h-14 pl-12 pr-4 rounded-xl text-white text-base placeholder:text-slate-500 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
                            placeholder="Prénom"
                            required
                        />
                    </div>

                    {/* Nom */}
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <MaterialIcon name="person" size="md" className="text-slate-500" />
                        </div>
                        <input
                            type="text"
                            name="lastName"
                            value={formData.lastName}
                            onChange={handleChange}
                            className="glass-input w-full h-14 pl-12 pr-4 rounded-xl text-white text-base placeholder:text-slate-500 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
                            placeholder="Nom"
                            required
                        />
                    </div>

                    {/* Email */}
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <MaterialIcon name="mail" size="md" className="text-slate-500" />
                        </div>
                        <input
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            className="glass-input w-full h-14 pl-12 pr-4 rounded-xl text-white text-base placeholder:text-slate-500 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
                            placeholder="Email"
                            required
                            autoComplete="email"
                        />
                    </div>

                    {/* Mot de passe */}
                    <div>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <MaterialIcon name="lock" size="md" className="text-slate-500" />
                            </div>
                            <input
                                type="password"
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                className="glass-input w-full h-14 pl-12 pr-4 rounded-xl text-white text-base placeholder:text-slate-500 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
                                placeholder="Mot de passe"
                                required
                                minLength={6}
                                autoComplete="new-password"
                            />
                        </div>
                        <p className="mt-1.5 text-xs text-slate-500 pl-1">Minimum 6 caractères</p>
                    </div>

                    {/* Confirmation mot de passe */}
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <MaterialIcon name="lock" size="md" className="text-slate-500" />
                        </div>
                        <input
                            type="password"
                            name="confirmPassword"
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            className="glass-input w-full h-14 pl-12 pr-4 rounded-xl text-white text-base placeholder:text-slate-500 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
                            placeholder="Confirmer le mot de passe"
                            required
                            autoComplete="new-password"
                        />
                    </div>

                    {/* Bouton de soumission */}
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
                                    Création en cours...
                                </>
                            ) : (
                                'Créer mon compte'
                            )}
                        </button>
                    </div>
                </form>

                {/* Divider */}
                <div className="flex items-center px-6 my-8 space-x-4">
                    <div className="flex-1 h-[1px] bg-slate-800" />
                    <span className="text-slate-500 text-sm font-medium">ou continuer avec</span>
                    <div className="flex-1 h-[1px] bg-slate-800" />
                </div>

                {/* Google Button */}
                <div className="px-6">
                    <button
                        onClick={handleGoogleSignUp}
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
                        <span className="text-white font-semibold">{loading ? 'Connexion...' : 'Continuer avec Google'}</span>
                    </button>
                </div>

                {/* Login Link */}
                <div className="mt-8 text-center">
                    <p className="text-slate-400 text-sm">
                        Vous avez déjà un compte ?{' '}
                        <Link href="/login" className="text-primary font-bold hover:underline">
                            Se connecter
                        </Link>
                    </p>
                </div>

                {/* Footer */}
                <div className="mt-auto pb-10 pt-6 text-center">
                    <p className="text-slate-500 text-xs">En créant un compte, vous acceptez nos</p>
                    <p className="mt-1 text-xs">
                        <a href="#" className="text-primary hover:underline">Conditions d&apos;utilisation</a>
                        {' '}&amp;{' '}
                        <a href="#" className="text-primary hover:underline">Politique de confidentialité</a>
                    </p>
                </div>
            </div>
        </div>
    );
}
