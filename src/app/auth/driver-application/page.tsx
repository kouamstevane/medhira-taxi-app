import Link from 'next/link';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

const APPLICATION_EMAIL = 'medjiraservices@gmail.com';

export default function DriverApplicationPage() {
  const subject = encodeURIComponent('Candidature Chauffeur / Livreur Medjira');
  const body = encodeURIComponent('Bonjour l’équipe Medjira,\n\nJe souhaite postuler en tant que Chauffeur / Livreur.\n\nNom complet :\nTéléphone :\nVille :\nPoste souhaité : Chauffeur / Livreur / Les deux\n\nVous trouverez mon CV en pièce jointe.\n\nCordialement,');

  return (
    <main className="min-h-screen bg-[#0a0a0a] px-4 py-10 text-white">
      <section className="mx-auto w-full max-w-2xl">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-primary">
          <MaterialIcon name="arrow_back" size="sm" /> Retour à l’accueil
        </Link>

        <div className="glass-card overflow-hidden rounded-3xl border border-white/10">
          <div className="border-b border-white/10 bg-gradient-to-br from-primary/20 via-transparent to-transparent p-8 sm:p-10">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/20">
              <MaterialIcon name="local_taxi" size="lg" />
            </div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-primary">Rejoignez Medjira</p>
            <h1 className="max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">Devenir Chauffeur ou Livreur</h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-300">
              Vous souhaitez recevoir des courses et développer votre activité avec Medjira ? Envoyez-nous votre CV pour étude de votre candidature.
            </p>
          </div>

          <div className="space-y-6 p-8 sm:p-10">
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ['attach_file', 'Envoyez votre CV'],
                ['fact_check', 'Votre dossier est étudié'],
                ['mark_email_read', 'Recevez votre invitation'],
              ].map(([icon, label], index) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">{index + 1}</span>
                  <MaterialIcon name={icon} size="md" className="mb-3 text-slate-300" />
                  <p className="text-sm font-semibold text-white">{label}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-primary/25 bg-primary/10 p-5">
              <p className="text-sm text-slate-300">Envoyez votre CV à l’adresse officielle :</p>
              <p className="mt-2 break-all text-lg font-bold text-primary">{APPLICATION_EMAIL}</p>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Indiquez votre nom complet, votre téléphone, votre ville et le poste souhaité. Après étude de votre candidature, notre équipe vous enverra un code personnel valable 48 heures si votre profil est retenu.
              </p>
            </div>

            <a href={`mailto:${APPLICATION_EMAIL}?subject=${subject}&body=${body}`} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 font-bold text-white transition hover:bg-primary/90">
              <MaterialIcon name="mail" size="sm" /> Envoyer mon CV par email
            </a>
            <p className="text-center text-xs text-slate-500">Le formulaire de création de compte est accessible uniquement après validation de votre candidature.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
