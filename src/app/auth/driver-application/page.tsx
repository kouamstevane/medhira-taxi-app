'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signInAnonymously } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytes } from 'firebase/storage';
import { auth, functions, getFirebaseStorage } from '@/config/firebase';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { InputField } from '@/components/forms';
import { driverPrimaryButtonClassName, driverUploadEmptyClassName } from '@/app/driver/register/components/driverOnboardingStyles';

const APPLICATION_EMAIL = 'medjiraservices@gmail.com';
const MAX_CV_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

function safeFileName(fileName: string): string {
  return fileName.trim().replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

function storagePath(uid: string, applicationId: string, fileName: string): string {
  return `driverApplications/${uid}/${applicationId}/cv/${safeFileName(fileName)}`;
}

export default function DriverApplicationPage() {
  const [email, setEmail] = useState('');
  const [cv, setCv] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const subject = encodeURIComponent('Candidature Chauffeur / Livreur Medjira');
  const body = encodeURIComponent('Bonjour l’équipe Medjira,\n\nJe souhaite postuler en tant que Chauffeur / Livreur.\n\nNom complet :\nTéléphone :\nVille :\nPoste souhaité : Chauffeur / Livreur / Les deux\n\nVous trouverez mon CV en pièce jointe.\n\nCordialement,');

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    if (!cv || !ALLOWED_TYPES.includes(cv.type) || cv.size > MAX_CV_SIZE) {
      setMessage({ type: 'error', text: 'Ajoutez un CV au format PDF ou DOCX, de 5 Mo maximum.' });
      return;
    }
    setSubmitting(true);
    try {
      const currentUser = auth.currentUser ?? (await signInAnonymously(auth)).user;
      const createUpload = httpsCallable<undefined, { applicationId: string }>(functions, 'createDriverApplicationUpload');
      const { data } = await createUpload();
      const applicationId = data.applicationId;
      await uploadBytes(ref(getFirebaseStorage(), storagePath(currentUser.uid, applicationId, cv.name)), cv, { contentType: cv.type });
      const submitApplication = httpsCallable(functions, 'submitDriverApplicationWithCv');
      await submitApplication({ applicationId, email, fileName: safeFileName(cv.name), contentType: cv.type, size: cv.size });
      setMessage({ type: 'success', text: 'Votre candidature a bien été envoyée. Notre équipe va l’étudier et vous contactera par e-mail si votre profil est retenu.' });
      setEmail(''); setCv(null);
      const fileInput = document.getElementById('cv-file') as HTMLInputElement | null;
      if (fileInput) fileInput.value = '';
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Impossible d’envoyer votre candidature. Réessayez ou utilisez l’envoi par e-mail.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] px-4 py-10 text-white">
      <section className="mx-auto w-full max-w-2xl">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-primary"><MaterialIcon name="arrow_back" size="sm" /> Retour à l’accueil</Link>
        <div className="glass-card overflow-hidden rounded-3xl border border-white/10">
          <div className="border-b border-white/10 bg-gradient-to-br from-primary/20 via-transparent to-transparent p-8 sm:p-10">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/20"><MaterialIcon name="local_taxi" size="lg" /></div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-primary">Rejoignez Medjira</p>
            <h1 className="max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">Devenir Chauffeur ou Livreur</h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-300">Envoyez votre candidature directement depuis ce formulaire. Après étude, un code personnel valable 48 heures vous sera envoyé par e-mail si votre profil est retenu.</p>
          </div>

          <div className="space-y-6 p-8 sm:p-10">
            {message && <div className={`rounded-2xl border p-4 text-sm ${message.type === 'success' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border-rose-400/30 bg-rose-400/10 text-rose-200'}`}>{message.text}</div>}
            <form onSubmit={submit} className="space-y-4">
              <InputField required label="Adresse e-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jean@email.com" />
              <label htmlFor="cv-file" className={driverUploadEmptyClassName}><span className="flex items-center gap-2 font-semibold text-white"><MaterialIcon name="attach_file" size="sm" /> {cv ? cv.name : 'Joindre votre CV'} <span className="text-red-500">*</span></span><span className="mt-2 text-sm text-slate-400">PDF ou DOCX uniquement · 5 Mo maximum</span><input id="cv-file" required type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={(e) => setCv(e.target.files?.[0] ?? null)} /></label>
              <button type="submit" disabled={submitting} className={driverPrimaryButtonClassName}><MaterialIcon name={submitting ? 'progress_activity' : 'send'} size="sm" /> {submitting ? 'Envoi en cours…' : 'Envoyer ma candidature'}</button>
            </form>

            <div className="border-t border-white/10 pt-5 text-center"><p className="text-xs text-slate-500">Vous préférez utiliser votre messagerie ?</p><a href={`mailto:${APPLICATION_EMAIL}?subject=${subject}&body=${body}`} className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"><MaterialIcon name="mail" size="sm" /> Envoyer mon CV par e-mail</a></div>
          </div>
        </div>
      </section>
    </main>
  );
}
