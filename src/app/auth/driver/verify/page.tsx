"use client";

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

export default function DriverVerifyPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background font-sans text-slate-100 antialiased flex items-center justify-center p-6">
      <div className="glass-card rounded-2xl w-full max-w-md p-8 text-center border border-white/10">
        <div className="mb-6">
          <div className="mx-auto w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mb-4 border border-green-500/20">
            <MaterialIcon name="check_circle" className="text-green-400 text-[32px]" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            Candidature soumise avec succès !
          </h1>
          <p className="text-slate-400">
            Votre demande d&apos;inscription en tant que chauffeur a été enregistrée.
          </p>
        </div>

        <div className="bg-blue-500/10 border border-blue-500/20 p-4 mb-6 text-left rounded-xl">
          <div className="flex gap-3">
            <MaterialIcon name="info" size="md" className="text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-blue-300 font-bold mb-2">Prochaines étapes :</p>
              <ul className="text-sm text-blue-300/80 space-y-1 list-disc list-inside">
                <li>Notre équipe va vérifier vos documents</li>
                <li>Vous recevrez un email de confirmation sous 48h</li>
                <li>Une fois approuvé, vous pourrez vous connecter</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => router.push('/driver/login')}
            className="w-full h-14 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
          >
            <MaterialIcon name="login" size="md" />
            Aller à la page de connexion
          </button>

          <Link
            href="/"
            className="block w-full text-center text-slate-400 hover:text-primary font-medium py-3 transition"
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    </div>
  );
}
