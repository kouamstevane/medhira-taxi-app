'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '@/config/firebase';
import { createAuthAccount, signInWithGoogleForDriver } from '@/services/auth.service';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

type Role = 'chauffeur' | 'livreur' | 'les_deux';

const errorMessage = (error: unknown): string => {
  const value = error as { code?: string; message?: string };
  if (value.code === 'functions/deadline-exceeded') return 'Cette invitation a expiré après 48 heures.';
  if (value.code === 'functions/permission-denied') return 'L’adresse email ou le code ne correspond pas à l’invitation.';
  if (value.code === 'auth/email-already-in-use') return 'Cette adresse possède déjà un compte. Connectez-vous avec ce compte ou contactez l’administration.';
  if (value.code === 'auth/popup-closed-by-user') return 'La fenêtre Google a été fermée. Réessayez pour continuer.';
  return value.message || 'Une erreur est survenue. Vérifiez vos informations et réessayez.';
};

export default function DriverInvitationClient() {
  const router = useRouter();
  const [step, setStep] = useState<'code' | 'account'>('code');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [invitationId, setInvitationId] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('invitationId');
    if (value) setInvitationId(value);
  }, []);

  const roleLabel = useMemo(() => role === 'les_deux' ? 'Chauffeur / Livreur' : role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Chauffeur / Livreur', [role]);

  const validate = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const callable = httpsCallable<{ invitationId: string; email: string; code: string }, { success: true; role: Role }>(functions, 'validateDriverInvitation');
      const result = await callable({ invitationId: invitationId.trim(), email: email.trim(), code: code.trim().toUpperCase() });
      setRole(result.data.role);
      setStep('account');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const complete = async () => {
    const callable = httpsCallable<{ invitationId: string; code: string }, { success: true }>(functions, 'completeDriverInvitation');
    await callable({ invitationId: invitationId.trim(), code: code.trim().toUpperCase() });
    router.replace('/driver/register');
  };

  const createWithPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await createAuthAccount(email.trim(), password);
      await complete();
    } catch (err) {
      setError(errorMessage(err));
      await auth.signOut().catch(() => undefined);
    } finally {
      setLoading(false);
    }
  };

  const createWithGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await signInWithGoogleForDriver();
      if ((user.email || '').toLowerCase() !== email.trim().toLowerCase()) {
        await auth.signOut();
        throw new Error('Cette adresse Google ne correspond pas à l’adresse email de l’invitation.');
      }
      await complete();
    } catch (err) {
      setError(errorMessage(err));
      await auth.signOut().catch(() => undefined);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] px-4 py-10 text-white">
      <section className="mx-auto w-full max-w-md glass-card rounded-3xl border border-white/10 p-7">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
            <MaterialIcon name="verified_user" size="lg" />
          </div>
          <h1 className="text-2xl font-bold">Créer votre compte</h1>
          <p className="mt-2 text-sm text-slate-400">Invitation professionnelle Medjira</p>
        </div>

        {error && <div role="alert" className="mb-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}

        {step === 'code' ? (
          <form onSubmit={validate} className="space-y-4">
            <label className="block text-sm text-slate-300">Identifiant de l’invitation
              <input required value={invitationId} onChange={(e) => setInvitationId(e.target.value)} className="glass-input mt-2 w-full rounded-xl px-4 py-3" placeholder="Identifiant fourni par Medjira" />
            </label>
            <label className="block text-sm text-slate-300">Adresse email autorisée
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="glass-input mt-2 w-full rounded-xl px-4 py-3" placeholder="vous@exemple.com" />
            </label>
            <label className="block text-sm text-slate-300">Code reçu par email
              <input required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="glass-input mt-2 w-full rounded-xl px-4 py-3 uppercase tracking-[0.2em]" placeholder="AB12CD34" />
            </label>
            <p className="text-xs leading-5 text-slate-500">Votre code est valable 48 heures. Passé ce délai, il expirera automatiquement.</p>
            <button disabled={loading} className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-white disabled:opacity-50">{loading ? 'Vérification…' : 'Vérifier mon invitation'}</button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">Invitation validée pour le poste : <strong>{roleLabel}</strong></div>
            <button type="button" disabled={loading} onClick={createWithGoogle} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 font-semibold text-slate-900 disabled:opacity-50"><MaterialIcon name="login" size="sm" /> Continuer avec Google</button>
            <div className="flex items-center gap-3 text-xs text-slate-500"><span className="h-px flex-1 bg-white/10" />ou<span className="h-px flex-1 bg-white/10" /></div>
            <form onSubmit={createWithPassword} className="space-y-4">
              <label className="block text-sm text-slate-300">Mot de passe
                <input required minLength={8} type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="glass-input mt-2 w-full rounded-xl px-4 py-3" placeholder="8 caractères minimum" />
              </label>
              <button disabled={loading} className="w-full rounded-xl border border-primary/40 bg-primary/15 px-4 py-3 font-semibold text-primary disabled:opacity-50">{loading ? 'Création…' : 'Créer avec email et mot de passe'}</button>
            </form>
          </div>
        )}
      </section>
    </main>
  );
}
