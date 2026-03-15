"use client";
/* eslint-disable */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/config/firebase';
import { updateProfile } from 'firebase/auth';
import { signUpWithEmail, signInWithGoogle } from '@/services/auth.service';
import Link from 'next/link';
import { FiUser, FiMail, FiLock, FiArrowLeft } from 'react-icons/fi';

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

    // Rediriger si déjà connecté
    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
            if (user && user.emailVerified) {
                router.push('/dashboard');
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
            setError('Veuillez remplir tous les champs obligatoires');
            return;
        }

        if (formData.password !== formData.confirmPassword) {
            setError('Les mots de passe ne correspondent pas');
            return;
        }

        if (formData.password.length < 6) {
            setError('Le mot de passe doit contenir au moins 6 caractères');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.email)) {
            setError('Adresse email invalide');
            return;
        }

        setLoading(true);

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
                setError('Adresse email invalide');
            } else if (error.code === 'auth/weak-password') {
                setError('Mot de passe trop faible (minimum 6 caractères)');
            } else if (error.code === 'auth/network-request-failed') {
                setError('Erreur de connexion. Vérifiez votre connexion internet');
            } else {
                setError(error.message || 'Erreur lors de la création du compte');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignUp = async () => {
        setError(null);
        setLoading(true);

        try {
            await signInWithGoogle();
            router.push('/dashboard');
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
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#f5f5f5] via-[#e6e6e6] to-[#f5f5f5] flex items-center justify-center p-4">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-20 left-10 w-64 h-64 bg-[#f29200] rounded-full opacity-10 blur-3xl animate-pulse" />
                <div className="absolute bottom-20 right-10 w-80 h-80 bg-[#f29200] rounded-full opacity-10 blur-3xl animate-pulse delay-1000" />
            </div>

            <div className="w-full max-w-md relative z-10">
                {/* Header */}
                <div className="text-center mb-8">
                    <Link
                        href="/"
                        className="inline-flex items-center text-gray-600 hover:text-[#f29200] transition-colors mb-6"
                    >
                        <FiArrowLeft className="mr-2" />
                        Retour
                    </Link>

                    <div className="flex justify-center mb-4">
                        <div className="w-16 h-16 bg-gradient-to-br from-[#f29200] to-[#e68600] rounded-2xl flex items-center justify-center shadow-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                                <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1v-1a1 1 0 011-1h2a1 1 0 011 1v1a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H19a1 1 0 001-1V5a1 1 0 00-1-1H3z" />
                            </svg>
                        </div>
                    </div>

                    <h1 className="text-3xl font-bold text-[#101010] mb-2">Créer un compte</h1>
                    <p className="text-gray-600">Rejoignez Medjira dès aujourd&apos;hui</p>
                </div>

                {/* Form */}
                <div className="bg-white rounded-2xl shadow-xl p-8">
                    {error && (
                        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded">
                            <p className="text-sm">{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Prénom */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Prénom <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <FiUser className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    name="firstName"
                                    value={formData.firstName}
                                    onChange={handleChange}
                                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f29200] focus:border-transparent transition text-[#101010]"
                                    placeholder="Jean"
                                    required
                                />
                            </div>
                        </div>

                        {/* Nom */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Nom <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <FiUser className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    name="lastName"
                                    value={formData.lastName}
                                    onChange={handleChange}
                                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f29200] focus:border-transparent transition text-[#101010]"
                                    placeholder="Dupont"
                                    required
                                />
                            </div>
                        </div>

                        {/* Email */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Email <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <FiMail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f29200] focus:border-transparent transition text-[#101010]"
                                    placeholder="jean.dupont@example.com"
                                    required
                                    autoComplete="email"
                                />
                            </div>
                        </div>

                        {/* Mot de passe */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Mot de passe <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <FiLock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                <input
                                    type="password"
                                    name="password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f29200] focus:border-transparent transition text-[#101010]"
                                    placeholder="••••••••"
                                    required
                                    minLength={6}
                                    autoComplete="new-password"
                                />
                            </div>
                            <p className="mt-1 text-xs text-gray-500">Minimum 6 caractères</p>
                        </div>

                        {/* Confirmation mot de passe */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Confirmer le mot de passe <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <FiLock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                <input
                                    type="password"
                                    name="confirmPassword"
                                    value={formData.confirmPassword}
                                    onChange={handleChange}
                                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f29200] focus:border-transparent transition text-[#101010]"
                                    placeholder="••••••••"
                                    required
                                    autoComplete="new-password"
                                />
                            </div>
                        </div>

                        {/* Bouton de soumission */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-gradient-to-r from-[#f29200] to-[#e68600] text-white rounded-lg font-bold shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                        >
                            {loading ? (
                                <span className="flex items-center justify-center">
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Création en cours...
                                </span>
                            ) : (
                                'Créer mon compte'
                            )}
                        </button>
                    </form>

                    {/* Séparateur */}
                    <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-300"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-white text-gray-500">Ou continuer avec</span>
                        </div>
                    </div>

                    {/* Bouton Google */}
                    <button
                        onClick={handleGoogleSignUp}
                        disabled={loading}
                        type="button"
                        className="w-full py-3 px-4 border border-gray-300 rounded-lg font-medium text-gray-700 bg-white hover:bg-gray-50 transition-all duration-300 flex items-center justify-center shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                        {loading ? 'Connexion...' : 'Continuer avec Google'}
                    </button>

                    {/* Lien de connexion */}
                    <div className="mt-6 text-center">
                        <p className="text-sm text-gray-600">
                            Vous avez déjà un compte ?{' '}
                            <Link href="/login" className="text-[#f29200] hover:text-[#e68600] font-semibold">
                                Se connecter
                            </Link>
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-8 text-center text-sm text-gray-500">
                    <p>En créant un compte, vous acceptez nos</p>
                    <p className="mt-1">
                        <a href="#" className="text-[#f29200] hover:underline">Conditions d&apos;utilisation</a>
                        {' '}&amp;{' '}
                        <a href="#" className="text-[#f29200] hover:underline">Politique de confidentialité</a>
                    </p>
                </div>
            </div>
        </div>
    );
}
