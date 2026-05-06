import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Supprimer mon compte — Medjira',
    description:
        "Demande de suppression de compte Medjira. Procédure conforme RGPD et exigences Google Play.",
    robots: { index: true, follow: true },
};

const PRIVACY_EMAIL = 'privacy@medjira.com';
const SUPPORT_EMAIL = 'support@medjira.com';
const APP_NAME = 'Medjira Taxi & Livraison';
const COMPANY_NAME = 'Medjira Service';

export default function AccountDeletePage() {
    const subject = encodeURIComponent('Demande de suppression de compte Medjira');
    const body = encodeURIComponent(
        [
            'Bonjour,',
            '',
            "Je demande la suppression définitive de mon compte Medjira et de l'ensemble des données personnelles associées, conformément à l'article 17 du RGPD.",
            '',
            "Identifiants du compte (à compléter) :",
            '- Adresse e-mail du compte : ',
            '- Numéro de téléphone associé : ',
            '- Type de compte (client / chauffeur / restaurateur) : ',
            '',
            "Je certifie être le titulaire du compte concerné.",
            '',
            'Cordialement,',
        ].join('\n'),
    );
    const mailtoUrl = `mailto:${PRIVACY_EMAIL}?subject=${subject}&body=${body}`;

    return (
        <main className="min-h-screen bg-background text-foreground">
            <div className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
                <header className="mb-10 border-b border-border pb-6">
                    <Link href="/" className="text-sm text-primary hover:underline">
                        ← Retour à l&apos;accueil
                    </Link>
                    <h1 className="mt-4 text-3xl font-bold sm:text-4xl">
                        Supprimer mon compte Medjira
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Application : <strong>{APP_NAME}</strong> — Éditeur :{' '}
                        {COMPANY_NAME}
                    </p>
                </header>

                <article className="space-y-8 text-[15px] leading-7">
                    <section className="rounded-lg border border-border bg-card p-5">
                        <h2 className="text-lg font-semibold text-primary">
                            ✅ Méthode recommandée — directement dans l&apos;application
                        </h2>
                        <p className="mt-2 text-foreground">
                            Si vous avez encore accès à votre compte, la
                            suppression est <strong>immédiate</strong> depuis
                            l&apos;application Medjira :
                        </p>
                        <ol className="mt-3 list-decimal pl-6 text-foreground">
                            <li>Ouvrez l&apos;application Medjira</li>
                            <li>
                                Allez dans l&apos;onglet{' '}
                                <strong>Profil</strong>
                            </li>
                            <li>
                                Faites défiler jusqu&apos;à{' '}
                                <strong>« Supprimer mon compte »</strong> en bas
                                de l&apos;écran
                            </li>
                            <li>
                                Confirmez votre choix dans la fenêtre qui
                                s&apos;affiche
                            </li>
                        </ol>
                        <p className="mt-3 text-sm text-muted-foreground">
                            La suppression est définitive et irréversible.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">
                            Vous ne pouvez plus accéder à votre compte ?
                        </h2>
                        <p className="mt-2">
                            Utilisez le formulaire ci-dessous pour demander la
                            suppression par e-mail. Notre équipe traitera votre
                            demande sous <strong>30 jours maximum</strong>{' '}
                            (article 12 RGPD), généralement sous 7 jours
                            ouvrés.
                        </p>

                        <div className="mt-5 rounded-lg border border-border bg-card p-5">
                            <p className="font-semibold">
                                Pour traiter votre demande, indiquez :
                            </p>
                            <ul className="mt-2 list-disc pl-6">
                                <li>l&apos;adresse e-mail du compte ;</li>
                                <li>
                                    le numéro de téléphone associé (au format
                                    international, ex. +33...) ;
                                </li>
                                <li>
                                    le type de compte (client, chauffeur,
                                    restaurateur).
                                </li>
                            </ul>
                            <p className="mt-3 text-sm text-muted-foreground">
                                Une vérification d&apos;identité pourra vous
                                être demandée pour éviter toute suppression
                                frauduleuse.
                            </p>

                            <a
                                href={mailtoUrl}
                                className="mt-5 inline-block rounded-md bg-red-600 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-red-700"
                            >
                                ✉️ Envoyer ma demande à {PRIVACY_EMAIL}
                            </a>

                            <p className="mt-3 text-xs text-muted-foreground">
                                Si le bouton ne fonctionne pas, écrivez
                                directement à{' '}
                                <a
                                    href={`mailto:${PRIVACY_EMAIL}`}
                                    className="text-primary hover:underline"
                                >
                                    {PRIVACY_EMAIL}
                                </a>
                                .
                            </p>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">
                            Quelles données sont supprimées ?
                        </h2>
                        <p className="mt-2">
                            La suppression entraîne l&apos;effacement définitif
                            de :
                        </p>
                        <ul className="mt-2 list-disc pl-6">
                            <li>
                                votre profil (nom, prénom, e-mail, téléphone,
                                photo) ;
                            </li>
                            <li>
                                vos identifiants d&apos;authentification
                                Firebase ;
                            </li>
                            <li>
                                vos adresses enregistrées et préférences ;
                            </li>
                            <li>
                                vos moyens de paiement enregistrés (le détache­
                                ment des cartes Stripe est effectué chez notre
                                prestataire de paiement) ;
                            </li>
                            <li>
                                vos messages de la messagerie intégrée ;
                            </li>
                            <li>
                                vos jetons de notification push (FCM).
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">
                            Quelles données sont conservées ?
                        </h2>
                        <p className="mt-2">
                            Certaines données doivent légalement être conservées
                            au-delà de la suppression du compte :
                        </p>
                        <ul className="mt-2 list-disc pl-6">
                            <li>
                                <strong>Factures et historique de courses</strong>{' '}
                                : conservés <strong>10 ans</strong> (obligation
                                comptable — art. L.123-22 Code de commerce),
                                sous une forme dissociée de votre identité.
                            </li>
                            <li>
                                <strong>Métadonnées d&apos;appels VoIP</strong>{' '}
                                (date, durée — pas le contenu) :{' '}
                                <strong>12 mois</strong>.
                            </li>
                            <li>
                                <strong>Logs de sécurité</strong> :{' '}
                                <strong>12 mois</strong>.
                            </li>
                            <li>
                                <strong>
                                    Documents réglementaires des chauffeurs
                                    vérifiés
                                </strong>{' '}
                                : durée du contrat + 5 ans.
                            </li>
                        </ul>
                        <p className="mt-3">
                            Plus de détails dans notre{' '}
                            <Link
                                href="/privacy"
                                className="text-primary hover:underline"
                            >
                                Politique de confidentialité
                            </Link>
                            .
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">Délai de traitement</h2>
                        <ul className="mt-2 list-disc pl-6">
                            <li>
                                <strong>Suppression in-app</strong> : immédiate.
                            </li>
                            <li>
                                <strong>Demande par e-mail</strong> : sous 30
                                jours maximum, en principe sous 7 jours
                                ouvrés.
                            </li>
                            <li>
                                Vous recevrez un e-mail de confirmation une fois
                                la suppression effectuée.
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">
                            Une question ?
                        </h2>
                        <p className="mt-2">
                            📧 Données personnelles :{' '}
                            <a
                                href={`mailto:${PRIVACY_EMAIL}`}
                                className="text-primary hover:underline"
                            >
                                {PRIVACY_EMAIL}
                            </a>
                            <br />
                            📧 Support général :{' '}
                            <a
                                href={`mailto:${SUPPORT_EMAIL}`}
                                className="text-primary hover:underline"
                            >
                                {SUPPORT_EMAIL}
                            </a>
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Si vous estimez que vos droits ne sont pas
                            respectés, vous pouvez introduire une réclamation
                            auprès de la <strong>CNIL</strong> :{' '}
                            <a
                                href="https://www.cnil.fr/fr/plaintes"
                                className="text-primary hover:underline"
                                target="_blank"
                                rel="noreferrer"
                            >
                                www.cnil.fr/fr/plaintes
                            </a>
                            .
                        </p>
                    </section>
                </article>

                <footer className="mt-12 border-t border-border pt-6 text-center text-sm text-muted-foreground">
                    <Link href="/" className="text-primary hover:underline">
                        ← Retour à l&apos;accueil
                    </Link>
                    <span className="mx-2">·</span>
                    <Link href="/privacy" className="text-primary hover:underline">
                        Politique de confidentialité
                    </Link>
                    <span className="mx-2">·</span>
                    <Link href="/terms" className="text-primary hover:underline">
                        CGU
                    </Link>
                </footer>
            </div>
        </main>
    );
}
