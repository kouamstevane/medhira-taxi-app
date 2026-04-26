"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { auth, db } from '@/config/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { AlertTriangle, ArrowRight } from 'lucide-react';

type StripeStatus = 'not_created' | 'pending' | 'active' | 'restricted' | 'disabled';

/**
 * Bandeau persistant qui s'affiche en haut du dashboard chauffeur tant que
 * Stripe Connect n'est pas `active`. Source de vérité = Firestore (mis à jour
 * par le webhook `account.updated` côté serveur).
 */
export function StripeOnboardingBanner() {
  const [status, setStatus] = useState<StripeStatus | null>(null);
  const [payoutsEnabled, setPayoutsEnabled] = useState<boolean>(false);
  const [requirementsCount, setRequirementsCount] = useState<number>(0);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const unsub = onSnapshot(
      doc(db, 'drivers', user.uid),
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        setStatus((d.stripeAccountStatus as StripeStatus) ?? 'not_created');
        setPayoutsEnabled(!!d.stripePayoutsEnabled);
        const due = d.requirements?.currently_due;
        setRequirementsCount(Array.isArray(due) ? due.length : 0);
      },
      (err) => {
        console.warn('[StripeOnboardingBanner] snapshot error', err.message);
      },
    );
    return () => unsub();
  }, []);

  // Tant qu'on ne sait pas, on n'affiche rien.
  if (status === null) return null;

  // Tout va bien — pas de bandeau.
  if (status === 'active' && payoutsEnabled) return null;

  let label: string;
  let sublabel: string;
  let tone: 'amber' | 'red';

  if (status === 'disabled') {
    label = 'Compte de paiement désactivé';
    sublabel = 'Contactez le support pour réactiver vos virements.';
    tone = 'red';
  } else if (status === 'restricted') {
    label = 'Compte de paiement restreint';
    sublabel = requirementsCount
      ? `${requirementsCount} information(s) à fournir pour débloquer vos virements.`
      : 'Vos virements sont bloqués. Vérifiez votre compte Stripe.';
    tone = 'red';
  } else if (status === 'not_created') {
    label = 'Configuration des paiements requise';
    sublabel = 'Vous ne pourrez pas être payé tant que votre compte Stripe n\'est pas configuré.';
    tone = 'amber';
  } else {
    // pending
    label = 'Configuration des paiements à terminer';
    sublabel = requirementsCount
      ? `${requirementsCount} information(s) demandée(s) par Stripe.`
      : 'Vérification Stripe en cours.';
    tone = 'amber';
  }

  const palette =
    tone === 'red'
      ? { bg: 'bg-red-500/10', border: 'border-red-500/40', icon: 'text-red-400', title: 'text-red-300', sub: 'text-red-200/80', cta: 'text-red-300' }
      : { bg: 'bg-amber-500/10', border: 'border-amber-500/40', icon: 'text-amber-400', title: 'text-amber-300', sub: 'text-amber-200/80', cta: 'text-amber-300' };

  return (
    <Link
      href="/driver/payments/setup"
      className={`block ${palette.bg} ${palette.border} border rounded-xl p-4 mb-3 active:opacity-80 transition`}
      aria-label="Terminer la configuration Stripe"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className={`w-5 h-5 ${palette.icon} mt-0.5 shrink-0`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${palette.title}`}>{label}</p>
          <p className={`text-xs mt-0.5 ${palette.sub}`}>{sublabel}</p>
        </div>
        <ArrowRight className={`w-4 h-4 ${palette.cta} mt-1 shrink-0`} />
      </div>
    </Link>
  );
}
