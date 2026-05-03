import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Politique de confidentialité — Medjira',
    description:
        'Politique de confidentialité de l\'application Medjira (taxi, livraison de repas et de colis). Conformité RGPD et Google Play.',
    robots: { index: true, follow: true },
};

const LAST_UPDATED = '2 mai 2026';
const CONTACT_EMAIL = 'privacy@medjira.com';
const SUPPORT_EMAIL = 'support@medjira.com';
const COMPANY_NAME = 'Medjira Service';
const COMPANY_ADDRESS = 'Adresse du siège social — à compléter';
const WEBSITE = 'https://medjira.com';

export default function PrivacyPage() {
    return (
        <main className="min-h-screen bg-white text-gray-900">
            <div className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
                <header className="mb-10 border-b border-gray-200 pb-6">
                    <Link
                        href="/"
                        className="text-sm text-blue-600 hover:underline"
                    >
                        ← Retour à l&apos;accueil
                    </Link>
                    <h1 className="mt-4 text-3xl font-bold sm:text-4xl">
                        Politique de confidentialité
                    </h1>
                    <p className="mt-2 text-sm text-gray-500">
                        Dernière mise à jour : {LAST_UPDATED}
                    </p>
                </header>

                <article className="prose prose-gray max-w-none space-y-8 text-[15px] leading-7">
                    <section>
                        <p>
                            La présente politique décrit comment{' '}
                            <strong>{COMPANY_NAME}</strong> (« nous », « notre »,
                            « Medjira ») collecte, utilise, partage et protège
                            les données personnelles des utilisateurs de
                            l&apos;application mobile et du site web Medjira (les
                            « Services »).
                        </p>
                        <p>
                            En utilisant les Services, vous acceptez les
                            pratiques décrites ci-dessous. Cette politique est
                            conforme au{' '}
                            <strong>Règlement Général sur la Protection des
                            Données (RGPD — UE 2016/679)</strong>, à la{' '}
                            <strong>Loi Informatique et Libertés</strong> et aux
                            exigences de <strong>Google Play Data Safety</strong>.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">
                            1. Responsable du traitement
                        </h2>
                        <p>
                            <strong>{COMPANY_NAME}</strong>
                            <br />
                            {COMPANY_ADDRESS}
                            <br />
                            Site web :{' '}
                            <a
                                href={WEBSITE}
                                className="text-blue-600 hover:underline"
                            >
                                {WEBSITE}
                            </a>
                            <br />
                            Contact protection des données :{' '}
                            <a
                                href={`mailto:${CONTACT_EMAIL}`}
                                className="text-blue-600 hover:underline"
                            >
                                {CONTACT_EMAIL}
                            </a>
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">
                            2. Données que nous collectons
                        </h2>

                        <h3 className="mt-4 text-lg font-semibold">
                            2.1 Données fournies directement par vous
                        </h3>
                        <ul className="list-disc pl-6">
                            <li>
                                <strong>Identité</strong> : nom, prénom, date de
                                naissance.
                            </li>
                            <li>
                                <strong>Coordonnées</strong> : adresse e-mail,
                                numéro de téléphone, adresse postale (livraisons).
                            </li>
                            <li>
                                <strong>Identifiants de connexion</strong> :
                                authentification Firebase (email / téléphone /
                                Google / Apple).
                            </li>
                            <li>
                                <strong>Photo de profil</strong> et, pour les
                                chauffeurs, documents d&apos;identité, permis de
                                conduire, carte grise, attestation
                                d&apos;assurance (vérification réglementaire).
                            </li>
                            <li>
                                <strong>Données de paiement</strong> : traitées
                                exclusivement par notre prestataire{' '}
                                <strong>Stripe</strong> (norme PCI-DSS niveau 1).
                                Nous ne stockons jamais vos numéros de carte.
                            </li>
                        </ul>

                        <h3 className="mt-4 text-lg font-semibold">
                            2.2 Données collectées automatiquement
                        </h3>
                        <ul className="list-disc pl-6">
                            <li>
                                <strong>Localisation précise (GPS)</strong> :
                                pour calculer les itinéraires, afficher les
                                chauffeurs proches et suivre votre course en
                                temps réel.
                            </li>
                            <li>
                                <strong>
                                    Localisation en arrière-plan (chauffeurs
                                    uniquement)
                                </strong>{' '}
                                : indispensable pour recevoir les demandes de
                                course et permettre le suivi durant les
                                livraisons en cours. Activée uniquement quand
                                une course est acceptée et désactivable à tout
                                moment.
                            </li>
                            <li>
                                <strong>Identifiants techniques</strong> :
                                identifiant d&apos;appareil, jeton de
                                notification push (Firebase Cloud Messaging),
                                version OS, modèle d&apos;appareil.
                            </li>
                            <li>
                                <strong>Journaux de diagnostic</strong> :
                                rapports de plantage et performances anonymisés
                                (Firebase Crashlytics / Performance) pour
                                améliorer la stabilité.
                            </li>
                            <li>
                                <strong>Données d&apos;utilisation</strong> :
                                actions effectuées dans l&apos;application,
                                écrans visités (analytics anonymisés).
                            </li>
                        </ul>

                        <h3 className="mt-4 text-lg font-semibold">
                            2.3 Données générées par l&apos;usage des Services
                        </h3>
                        <ul className="list-disc pl-6">
                            <li>
                                <strong>Historique des courses et commandes</strong>{' '}
                                : trajets, montants, notes, avis.
                            </li>
                            <li>
                                <strong>Communications</strong> : messages
                                échangés via la messagerie intégrée.
                            </li>
                            <li>
                                <strong>Appels VoIP</strong> : audio acheminé
                                en temps réel via WebRTC entre le client et le
                                chauffeur, avec masquage des numéros.{' '}
                                <strong>
                                    Le contenu audio n&apos;est ni enregistré ni
                                    stocké
                                </strong>
                                . Seuls les métadonnées (date, durée,
                                participants) sont conservées.
                            </li>
                            <li>
                                <strong>Photos de preuve de livraison</strong>{' '}
                                (colis et repas) prises par le chauffeur à la
                                livraison.
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">
                            3. Finalités et bases légales (RGPD)
                        </h2>
                        <div className="overflow-x-auto">
                            <table className="my-4 w-full border-collapse text-sm">
                                <thead>
                                    <tr className="border-b border-gray-300 bg-gray-50">
                                        <th className="p-2 text-left">
                                            Finalité
                                        </th>
                                        <th className="p-2 text-left">
                                            Base légale
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="border-b border-gray-200">
                                        <td className="p-2">
                                            Création et gestion du compte
                                        </td>
                                        <td className="p-2">
                                            Exécution du contrat
                                        </td>
                                    </tr>
                                    <tr className="border-b border-gray-200">
                                        <td className="p-2">
                                            Mise en relation chauffeur/client,
                                            calcul d&apos;itinéraire
                                        </td>
                                        <td className="p-2">
                                            Exécution du contrat
                                        </td>
                                    </tr>
                                    <tr className="border-b border-gray-200">
                                        <td className="p-2">
                                            Paiement et facturation
                                        </td>
                                        <td className="p-2">
                                            Exécution du contrat / Obligation
                                            légale
                                        </td>
                                    </tr>
                                    <tr className="border-b border-gray-200">
                                        <td className="p-2">
                                            Vérification des chauffeurs
                                            (documents)
                                        </td>
                                        <td className="p-2">
                                            Obligation légale (transport de
                                            personnes)
                                        </td>
                                    </tr>
                                    <tr className="border-b border-gray-200">
                                        <td className="p-2">
                                            Notifications de course
                                        </td>
                                        <td className="p-2">
                                            Exécution du contrat
                                        </td>
                                    </tr>
                                    <tr className="border-b border-gray-200">
                                        <td className="p-2">
                                            Notifications marketing
                                        </td>
                                        <td className="p-2">
                                            Consentement (révocable)
                                        </td>
                                    </tr>
                                    <tr className="border-b border-gray-200">
                                        <td className="p-2">
                                            Sécurité, prévention de la fraude
                                        </td>
                                        <td className="p-2">
                                            Intérêt légitime
                                        </td>
                                    </tr>
                                    <tr className="border-b border-gray-200">
                                        <td className="p-2">
                                            Amélioration de l&apos;application
                                            (analytics, crash logs)
                                        </td>
                                        <td className="p-2">
                                            Intérêt légitime
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="p-2">
                                            Réponse aux réquisitions
                                            judiciaires
                                        </td>
                                        <td className="p-2">
                                            Obligation légale
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">
                            4. Partage des données
                        </h2>
                        <p>
                            Nous ne vendons jamais vos données. Nous les
                            partageons uniquement dans les cas suivants :
                        </p>
                        <ul className="list-disc pl-6">
                            <li>
                                <strong>Avec le chauffeur ou le client</strong>{' '}
                                de votre course : prénom, photo, position en
                                temps réel, note moyenne. Le numéro de
                                téléphone réel est masqué (relais via VoIP).
                            </li>
                            <li>
                                <strong>Avec nos sous-traitants</strong>{' '}
                                techniques (responsables des traitements
                                conformément à l&apos;art. 28 RGPD) :
                                <ul className="mt-1 list-disc pl-6">
                                    <li>
                                        <strong>Google Firebase</strong>{' '}
                                        (Authentication, Firestore, Cloud
                                        Functions, Cloud Messaging,
                                        Crashlytics) — Google Ireland Ltd.
                                    </li>
                                    <li>
                                        <strong>Google Maps Platform</strong>{' '}
                                        — itinéraires et cartographie.
                                    </li>
                                    <li>
                                        <strong>Stripe Payments Europe</strong>{' '}
                                        — traitement des paiements.
                                    </li>
                                    <li>
                                        <strong>Twilio / fournisseur VoIP</strong>{' '}
                                        — appels anonymisés (à adapter selon
                                        votre fournisseur réel).
                                    </li>
                                </ul>
                            </li>
                            <li>
                                <strong>Avec les autorités</strong> en cas de
                                réquisition judiciaire ou d&apos;obligation
                                légale.
                            </li>
                            <li>
                                <strong>
                                    En cas de cession d&apos;activité
                                </strong>{' '}
                                : un repreneur éventuel serait soumis aux mêmes
                                obligations.
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">
                            5. Transferts hors UE
                        </h2>
                        <p>
                            Certains sous-traitants (Google, Stripe) peuvent
                            héberger des données aux États-Unis. Ces transferts
                            sont encadrés par les{' '}
                            <strong>
                                Clauses Contractuelles Types de la Commission
                                européenne
                            </strong>{' '}
                            et le <strong>Data Privacy Framework</strong>{' '}
                            (Commission UE — décision d&apos;adéquation du 10
                            juillet 2023).
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">
                            6. Durée de conservation
                        </h2>
                        <ul className="list-disc pl-6">
                            <li>
                                <strong>Compte actif</strong> : tant que vous
                                utilisez les Services.
                            </li>
                            <li>
                                <strong>Compte inactif</strong> : 3 ans après
                                la dernière connexion, puis suppression
                                automatique.
                            </li>
                            <li>
                                <strong>
                                    Historique de courses et factures
                                </strong>{' '}
                                : 10 ans (obligation comptable).
                            </li>
                            <li>
                                <strong>Données de localisation</strong>{' '}
                                détaillées : 12 mois maximum, puis agrégation
                                anonymisée.
                            </li>
                            <li>
                                <strong>Métadonnées d&apos;appels VoIP</strong>{' '}
                                : 12 mois.
                            </li>
                            <li>
                                <strong>Logs de sécurité</strong> : 12 mois.
                            </li>
                            <li>
                                <strong>Documents chauffeurs vérifiés</strong>{' '}
                                : durée du contrat + 5 ans.
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">
                            7. Vos droits (RGPD)
                        </h2>
                        <p>
                            Vous disposez à tout moment des droits suivants :
                        </p>
                        <ul className="list-disc pl-6">
                            <li>
                                <strong>Droit d&apos;accès</strong> à vos
                                données.
                            </li>
                            <li>
                                <strong>Droit de rectification</strong> de
                                données inexactes.
                            </li>
                            <li>
                                <strong>
                                    Droit à l&apos;effacement
                                </strong>{' '}
                                (« droit à l&apos;oubli »).
                            </li>
                            <li>
                                <strong>Droit à la limitation</strong> du
                                traitement.
                            </li>
                            <li>
                                <strong>
                                    Droit à la portabilité
                                </strong>{' '}
                                de vos données dans un format structuré.
                            </li>
                            <li>
                                <strong>Droit d&apos;opposition</strong> au
                                traitement basé sur l&apos;intérêt légitime.
                            </li>
                            <li>
                                <strong>
                                    Droit de retirer votre consentement
                                </strong>{' '}
                                à tout moment.
                            </li>
                            <li>
                                <strong>
                                    Droit de définir des directives
                                    post-mortem
                                </strong>{' '}
                                concernant vos données.
                            </li>
                        </ul>
                        <p>
                            Pour exercer ces droits, écrivez-nous à{' '}
                            <a
                                href={`mailto:${CONTACT_EMAIL}`}
                                className="text-blue-600 hover:underline"
                            >
                                {CONTACT_EMAIL}
                            </a>{' '}
                            avec une preuve d&apos;identité. Nous répondons
                            sous 30 jours maximum.
                        </p>
                        <p>
                            Vous pouvez également supprimer votre compte
                            directement depuis l&apos;application : <em>Profil
                            → Paramètres → Supprimer mon compte</em>, ou en
                            ligne sur{' '}
                            <a
                                href={`${WEBSITE}/account/delete`}
                                className="text-blue-600 hover:underline"
                            >
                                {WEBSITE}/account/delete
                            </a>
                            .
                        </p>
                        <p>
                            Si vous estimez que vos droits ne sont pas
                            respectés, vous pouvez introduire une réclamation
                            auprès de la <strong>CNIL</strong> :{' '}
                            <a
                                href="https://www.cnil.fr/fr/plaintes"
                                className="text-blue-600 hover:underline"
                                target="_blank"
                                rel="noreferrer"
                            >
                                www.cnil.fr/fr/plaintes
                            </a>
                            .
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">
                            8. Sécurité des données
                        </h2>
                        <ul className="list-disc pl-6">
                            <li>
                                Chiffrement TLS 1.2+ pour toutes les
                                communications.
                            </li>
                            <li>
                                Données stockées chez Google Cloud (Firebase),
                                certifié ISO 27001, ISO 27017, ISO 27018, SOC
                                2.
                            </li>
                            <li>
                                Authentification multi-facteurs disponible
                                (téléphone, email).
                            </li>
                            <li>
                                Accès aux données limité aux personnels
                                habilités, avec journalisation.
                            </li>
                            <li>
                                Paiements traités par Stripe (PCI-DSS niveau
                                1).
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">
                            9. Permissions Android et iOS
                        </h2>
                        <ul className="list-disc pl-6">
                            <li>
                                <strong>Localisation</strong> : trouver les
                                chauffeurs, suivre la course.
                            </li>
                            <li>
                                <strong>
                                    Localisation en arrière-plan
                                </strong>{' '}
                                : chauffeurs uniquement, pendant une course
                                active.
                            </li>
                            <li>
                                <strong>Microphone</strong> : appels VoIP avec
                                votre interlocuteur (jamais enregistrés).
                            </li>
                            <li>
                                <strong>Caméra et photos</strong> : photo de
                                profil, scan de documents, preuve de
                                livraison.
                            </li>
                            <li>
                                <strong>Notifications</strong> : alertes de
                                course, messages, paiements.
                            </li>
                            <li>
                                <strong>Bluetooth</strong> : connexion à un
                                kit mains-libres pour les appels.
                            </li>
                        </ul>
                        <p>
                            Vous pouvez révoquer chaque permission à tout
                            moment depuis les paramètres de votre appareil.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">
                            10. Mineurs
                        </h2>
                        <p>
                            Les Services ne sont pas destinés aux personnes de
                            moins de <strong>18 ans</strong>. Nous ne
                            collectons pas sciemment de données de mineurs. Si
                            vous découvrez qu&apos;un mineur a créé un compte,
                            contactez-nous : nous le supprimerons.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">
                            11. Cookies et traceurs (site web)
                        </h2>
                        <p>
                            Le site web utilise uniquement des cookies
                            strictement nécessaires (session, sécurité,
                            préférences). Les cookies analytiques ne sont
                            déposés qu&apos;après votre consentement explicite
                            via le bandeau prévu à cet effet.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">
                            12. Modifications de la politique
                        </h2>
                        <p>
                            Nous pouvons mettre à jour cette politique pour
                            refléter des évolutions légales ou techniques. La
                            date de dernière mise à jour figure en haut de
                            cette page. En cas de modification substantielle,
                            nous vous notifierons via l&apos;application ou par
                            e-mail au moins 30 jours avant l&apos;entrée en
                            vigueur.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold">
                            13. Contact
                        </h2>
                        <p>
                            Pour toute question relative à vos données :
                            <br />
                            📧 Données personnelles :{' '}
                            <a
                                href={`mailto:${CONTACT_EMAIL}`}
                                className="text-blue-600 hover:underline"
                            >
                                {CONTACT_EMAIL}
                            </a>
                            <br />
                            📧 Support général :{' '}
                            <a
                                href={`mailto:${SUPPORT_EMAIL}`}
                                className="text-blue-600 hover:underline"
                            >
                                {SUPPORT_EMAIL}
                            </a>
                            <br />
                            🌐 Site :{' '}
                            <a
                                href={WEBSITE}
                                className="text-blue-600 hover:underline"
                            >
                                {WEBSITE}
                            </a>
                        </p>
                    </section>
                </article>

                <footer className="mt-12 border-t border-gray-200 pt-6 text-center text-sm text-gray-500">
                    <Link
                        href="/"
                        className="text-blue-600 hover:underline"
                    >
                        ← Retour à l&apos;accueil
                    </Link>
                </footer>
            </div>
        </main>
    );
}
