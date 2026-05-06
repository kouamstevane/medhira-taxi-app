import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: "Conditions générales d'utilisation — Medjira",
    description:
        "Conditions générales d'utilisation de l'application Medjira (taxi, livraison de repas et de colis).",
    robots: { index: true, follow: true },
};

const LAST_UPDATED = '6 mai 2026';
const COMPANY_NAME = 'Medjira Service';
const COMPANY_ADDRESS = 'Adresse du siège social — à compléter';
const SUPPORT_EMAIL = 'support@medjira.com';
const LEGAL_EMAIL = 'legal@medjira.com';
const WEBSITE = 'https://medjira.com';

export default function TermsPage() {
    return (
        <main className="min-h-screen bg-background text-foreground">
            <div className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
                <header className="mb-10 border-b border-border pb-6">
                    <Link href="/" className="text-sm text-primary hover:underline">
                        ← Retour à l&apos;accueil
                    </Link>
                    <h1 className="mt-4 text-3xl font-bold sm:text-4xl">
                        Conditions générales d&apos;utilisation
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Dernière mise à jour : {LAST_UPDATED}
                    </p>
                </header>

                <article className="prose prose-invert max-w-none space-y-8 text-[15px] leading-7">
                    <section>
                        <h2 className="text-2xl font-semibold">1. Objet</h2>
                        <p>
                            Les présentes Conditions Générales d&apos;Utilisation
                            (« CGU ») régissent l&apos;accès et l&apos;utilisation
                            de l&apos;application mobile et du site web Medjira
                            (les « Services ») édités par{' '}
                            <strong>{COMPANY_NAME}</strong>. En créant un compte
                            ou en utilisant les Services, vous acceptez sans
                            réserve les présentes CGU.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">2. Éditeur</h2>
                        <p>
                            <strong>{COMPANY_NAME}</strong>
                            <br />
                            {COMPANY_ADDRESS}
                            <br />
                            Site :{' '}
                            <a href={WEBSITE} className="text-primary hover:underline">
                                {WEBSITE}
                            </a>
                            <br />
                            Contact :{' '}
                            <a
                                href={`mailto:${SUPPORT_EMAIL}`}
                                className="text-primary hover:underline"
                            >
                                {SUPPORT_EMAIL}
                            </a>
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">3. Nature du service</h2>
                        <p>
                            Medjira est une <strong>plateforme de mise en relation</strong>{' '}
                            entre des utilisateurs (clients) et des prestataires
                            indépendants (chauffeurs VTC/taxi, livreurs,
                            restaurateurs). Medjira <strong>n&apos;est pas un
                            transporteur</strong>, ni un restaurateur, et
                            n&apos;exécute pas elle-même les courses, livraisons
                            ou prestations de restauration.
                        </p>
                        <p>
                            Les prestataires sont seuls responsables de
                            l&apos;exécution de leurs prestations, du respect des
                            réglementations applicables (transport, hygiène,
                            assurance), et de leur situation fiscale et sociale.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">4. Inscription et compte</h2>
                        <ul className="list-disc pl-6">
                            <li>
                                L&apos;inscription est réservée aux personnes
                                majeures (18 ans révolus) capables juridiquement.
                            </li>
                            <li>
                                Vous garantissez l&apos;exactitude des
                                informations fournies et vous engagez à les
                                tenir à jour.
                            </li>
                            <li>
                                Vous êtes responsable de la confidentialité de
                                vos identifiants. Toute action réalisée depuis
                                votre compte est réputée effectuée par vous.
                            </li>
                            <li>
                                Les chauffeurs doivent fournir des documents
                                valides (permis, assurance, carte
                                professionnelle le cas échéant) et acceptent
                                leur vérification.
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">
                            5. Tarification, paiement, annulation
                        </h2>
                        <h3 className="mt-4 text-lg font-semibold">5.1 Tarifs</h3>
                        <p>
                            Le prix de chaque course ou livraison est calculé
                            avant validation, en fonction de la distance, de la
                            durée estimée, du type de service et d&apos;une
                            éventuelle majoration tarifaire (heures de pointe,
                            événements). Le prix affiché avant confirmation est
                            ferme, sauf modification du trajet à votre
                            initiative.
                        </p>

                        <h3 className="mt-4 text-lg font-semibold">5.2 Paiement</h3>
                        <p>
                            Les paiements en ligne sont traités exclusivement
                            par <strong>Stripe Payments Europe</strong> (norme
                            PCI-DSS niveau 1). Medjira ne stocke jamais les
                            numéros de carte. Le paiement en espèces est
                            possible auprès du chauffeur lorsqu&apos;il est
                            proposé.
                        </p>

                        <h3 className="mt-4 text-lg font-semibold">5.3 Annulation</h3>
                        <ul className="list-disc pl-6">
                            <li>
                                Annulation gratuite dans un délai défini après
                                la réservation et avant l&apos;arrivée du
                                chauffeur.
                            </li>
                            <li>
                                Au-delà, des frais d&apos;annulation peuvent
                                être appliqués (montant indiqué dans
                                l&apos;application).
                            </li>
                            <li>
                                En cas de no-show (absence du client après
                                arrivée du chauffeur), des frais forfaitaires
                                peuvent être facturés.
                            </li>
                        </ul>

                        <h3 className="mt-4 text-lg font-semibold">5.4 Remboursement</h3>
                        <p>
                            Les demandes de remboursement (course non effectuée,
                            facturation incorrecte) sont à adresser à{' '}
                            <a
                                href={`mailto:${SUPPORT_EMAIL}`}
                                className="text-primary hover:underline"
                            >
                                {SUPPORT_EMAIL}
                            </a>{' '}
                            sous 14 jours. Les remboursements éligibles sont
                            crédités sur le moyen de paiement initial sous 5 à
                            10 jours ouvrés.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">
                            6. Obligations des utilisateurs
                        </h2>
                        <p>Vous vous engagez à :</p>
                        <ul className="list-disc pl-6">
                            <li>
                                utiliser les Services conformément à leur
                                destination et à la réglementation en vigueur ;
                            </li>
                            <li>
                                ne pas perturber le fonctionnement des Services
                                (intrusion, contournement de sécurité, scraping,
                                bot) ;
                            </li>
                            <li>
                                ne pas utiliser les Services à des fins
                                illicites, frauduleuses ou portant atteinte à
                                autrui ;
                            </li>
                            <li>
                                respecter les chauffeurs, livreurs et autres
                                utilisateurs ; tout comportement violent,
                                harcelant ou discriminatoire pourra entraîner
                                la suspension du compte ;
                            </li>
                            <li>
                                ne pas transporter de marchandises illégales,
                                dangereuses, ou contraires aux conditions
                                d&apos;assurance.
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">
                            7. Responsabilité
                        </h2>
                        <p>
                            Medjira agit en qualité d&apos;
                            <strong>intermédiaire technique</strong> et ne
                            saurait être tenue responsable :
                        </p>
                        <ul className="list-disc pl-6">
                            <li>
                                des dommages causés lors de l&apos;exécution des
                                prestations par les prestataires indépendants
                                (couverts par leurs propres assurances) ;
                            </li>
                            <li>
                                des indisponibilités temporaires des Services
                                (maintenance, incidents tiers, force majeure) ;
                            </li>
                            <li>
                                des incidents de paiement résultant d&apos;un
                                dysfonctionnement de Stripe ou de votre
                                établissement bancaire.
                            </li>
                        </ul>
                        <p>
                            La responsabilité de Medjira, lorsqu&apos;elle est
                            engagée, est limitée au montant de la course ou
                            livraison concernée.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">
                            8. Données personnelles
                        </h2>
                        <p>
                            Le traitement de vos données est décrit dans notre{' '}
                            <Link
                                href="/privacy"
                                className="text-primary hover:underline"
                            >
                                Politique de confidentialité
                            </Link>
                            . Vous pouvez à tout moment supprimer votre compte
                            depuis l&apos;application (Profil → Supprimer mon
                            compte) ou via la page publique{' '}
                            <Link
                                href="/account/delete"
                                className="text-primary hover:underline"
                            >
                                {WEBSITE}/account/delete
                            </Link>
                            .
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">
                            9. Propriété intellectuelle
                        </h2>
                        <p>
                            Le nom Medjira, le logo, les éléments graphiques,
                            l&apos;interface, les textes et le code source sont
                            la propriété exclusive de {COMPANY_NAME}. Toute
                            reproduction, représentation ou exploitation non
                            autorisée est interdite.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">
                            10. Suspension et résiliation
                        </h2>
                        <p>
                            Medjira peut suspendre ou résilier un compte en cas
                            de manquement grave aux présentes CGU, de fraude
                            avérée, ou de comportement portant atteinte à la
                            sécurité des autres utilisateurs. La suspension est
                            notifiée par e-mail. Vous pouvez résilier votre
                            compte à tout moment depuis l&apos;application.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">
                            11. Modification des CGU
                        </h2>
                        <p>
                            Medjira peut modifier les CGU pour refléter des
                            évolutions légales, techniques ou commerciales. Les
                            modifications substantielles vous seront notifiées
                            au moins 30 jours avant leur entrée en vigueur. La
                            poursuite de l&apos;usage des Services vaut
                            acceptation des nouvelles CGU.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">
                            12. Droit applicable et juridiction
                        </h2>
                        <p>
                            Les présentes CGU sont soumises au{' '}
                            <strong>droit français</strong>. À défaut de
                            résolution amiable, tout litige sera porté devant
                            les juridictions françaises compétentes,
                            conformément aux règles de droit commun. Le
                            consommateur peut recourir gratuitement à la{' '}
                            <strong>plateforme européenne de règlement en
                            ligne des litiges</strong> :{' '}
                            <a
                                href="https://ec.europa.eu/consumers/odr"
                                className="text-primary hover:underline"
                                target="_blank"
                                rel="noreferrer"
                            >
                                ec.europa.eu/consumers/odr
                            </a>
                            .
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">13. Contact</h2>
                        <p>
                            📧 Support :{' '}
                            <a
                                href={`mailto:${SUPPORT_EMAIL}`}
                                className="text-primary hover:underline"
                            >
                                {SUPPORT_EMAIL}
                            </a>
                            <br />
                            ⚖️ Questions juridiques :{' '}
                            <a
                                href={`mailto:${LEGAL_EMAIL}`}
                                className="text-primary hover:underline"
                            >
                                {LEGAL_EMAIL}
                            </a>
                        </p>
                    </section>
                </article>

                <footer className="mt-12 border-t border-border pt-6 text-center text-sm text-muted-foreground">
                    <Link href="/" className="text-primary hover:underline">
                        ← Retour à l&apos;accueil
                    </Link>
                </footer>
            </div>
        </main>
    );
}
