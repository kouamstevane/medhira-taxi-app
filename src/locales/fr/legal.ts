// Pages légales (politique de confidentialité, CGU).
// Balisage riche minimal : <b>…</b> (gras) et <i>…</i> (italique), rendu côté composant.
export const legal = {
  common: {
    backHome: "← Retour à l'accueil",
    companyAddress: 'Adresse du siège social — à compléter',
  },
  privacy: {
    metaTitle: 'Politique de confidentialité — Medjira',
    metaDescription:
      "Politique de confidentialité de l'application Medjira (taxi, livraison de repas et de colis). Conformité RGPD et Google Play.",
    title: 'Politique de confidentialité',
    lastUpdated: 'Dernière mise à jour : {date}',
    updatedDate: '2 mai 2026',
    intro1:
      "La présente politique décrit comment <b>{company}</b> (« nous », « notre », « Medjira ») collecte, utilise, partage et protège les données personnelles des utilisateurs de l'application mobile et du site web Medjira (les « Services »).",
    intro2:
      'En utilisant les Services, vous acceptez les pratiques décrites ci-dessous. Cette politique est conforme au <b>Règlement Général sur la Protection des Données (RGPD — UE 2016/679)</b>, à la <b>Loi Informatique et Libertés</b> et aux exigences de <b>Google Play Data Safety</b>.',
    s1: {
      title: '1. Responsable du traitement',
      websiteLabel: 'Site web :',
      contactLabel: 'Contact protection des données :',
    },
    s2: {
      title: '2. Données que nous collectons',
      directTitle: '2.1 Données fournies directement par vous',
      direct: {
        identity: '<b>Identité</b> : nom, prénom, date de naissance.',
        contact:
          '<b>Coordonnées</b> : adresse e-mail, numéro de téléphone, adresse postale (livraisons).',
        credentials:
          '<b>Identifiants de connexion</b> : authentification Firebase (email / Google / Apple) et vérification téléphone par SMS.',
        photo:
          "<b>Photo de profil</b> et, pour les chauffeurs, documents d'identité, permis de conduire, carte grise, attestation d'assurance (vérification réglementaire).",
        payment:
          '<b>Données de paiement</b> : traitées exclusivement par notre prestataire <b>Stripe</b> (norme PCI-DSS niveau 1). Nous ne stockons jamais vos numéros de carte.',
      },
      autoTitle: '2.2 Données collectées automatiquement',
      auto: {
        gps: '<b>Localisation précise (GPS)</b> : pour calculer les itinéraires, afficher les chauffeurs proches et suivre votre course en temps réel.',
        background:
          '<b>Localisation en arrière-plan (chauffeurs uniquement)</b> : indispensable pour recevoir les demandes de course et permettre le suivi durant les livraisons en cours. Activée uniquement quand une course est acceptée et désactivable à tout moment.',
        technical:
          "<b>Identifiants techniques</b> : identifiant d'appareil, jeton de notification push (Firebase Cloud Messaging), version OS, modèle d'appareil.",
        diagnostics:
          '<b>Journaux de diagnostic</b> : rapports de plantage et performances anonymisés (Firebase Crashlytics / Performance) pour améliorer la stabilité.',
        usage:
          "<b>Données d'utilisation</b> : actions effectuées dans l'application, écrans visités (analytics anonymisés).",
      },
      generatedTitle: "2.3 Données générées par l'usage des Services",
      generated: {
        history:
          '<b>Historique des courses et commandes</b> : trajets, montants, notes, avis.',
        comms:
          '<b>Communications</b> : messages échangés via la messagerie intégrée.',
        voip: "<b>Appels VoIP</b> : audio acheminé en temps réel via WebRTC entre le client et le chauffeur, avec masquage des numéros. <b>Le contenu audio n'est ni enregistré ni stocké</b>. Seuls les métadonnées (date, durée, participants) sont conservées.",
        proof:
          '<b>Photos de preuve de livraison</b> (colis et repas) prises par le chauffeur à la livraison.',
      },
    },
    s3: {
      title: '3. Finalités et bases légales (RGPD)',
      colPurpose: 'Finalité',
      colBasis: 'Base légale',
      purposes: {
        account: 'Création et gestion du compte',
        matching: "Mise en relation chauffeur/client, calcul d'itinéraire",
        payment: 'Paiement et facturation',
        verification: 'Vérification des chauffeurs (documents)',
        rideNotifications: 'Notifications de course',
        marketing: 'Notifications marketing',
        security: 'Sécurité, prévention de la fraude',
        improvement: "Amélioration de l'application (analytics, crash logs)",
        judicial: 'Réponse aux réquisitions judiciaires',
      },
      bases: {
        contract: 'Exécution du contrat',
        contractLegal: 'Exécution du contrat / Obligation légale',
        legalTransport: 'Obligation légale (transport de personnes)',
        consent: 'Consentement (révocable)',
        legitimate: 'Intérêt légitime',
        legal: 'Obligation légale',
      },
    },
    s4: {
      title: '4. Partage des données',
      intro:
        'Nous ne vendons jamais vos données. Nous les partageons uniquement dans les cas suivants :',
      counterpart:
        '<b>Avec le chauffeur ou le client</b> de votre course : prénom, photo, position en temps réel, note moyenne. Le numéro de téléphone réel est masqué (relais via VoIP).',
      processors:
        "<b>Avec nos sous-traitants</b> techniques (responsables des traitements conformément à l'art. 28 RGPD) :",
      firebase:
        '<b>Google Firebase</b> (Authentication, Firestore, Cloud Functions, Cloud Messaging, Crashlytics) — Google Ireland Ltd.',
      maps: '<b>Google Maps Platform</b> — itinéraires et cartographie.',
      stripe: '<b>Stripe Payments Europe</b> — traitement des paiements.',
      twilio:
        '<b>Twilio / fournisseur VoIP</b> — appels anonymisés (à adapter selon votre fournisseur réel).',
      authorities:
        "<b>Avec les autorités</b> en cas de réquisition judiciaire ou d'obligation légale.",
      transfer:
        "<b>En cas de cession d'activité</b> : un repreneur éventuel serait soumis aux mêmes obligations.",
    },
    s5: {
      title: '5. Transferts hors UE',
      text: "Certains sous-traitants (Google, Stripe) peuvent héberger des données aux États-Unis. Ces transferts sont encadrés par les <b>Clauses Contractuelles Types de la Commission européenne</b> et le <b>Data Privacy Framework</b> (Commission UE — décision d'adéquation du 10 juillet 2023).",
    },
    s6: {
      title: '6. Durée de conservation',
      active: "<b>Compte actif</b> : tant que vous utilisez les Services.",
      inactive:
        '<b>Compte inactif</b> : 3 ans après la dernière connexion, puis suppression automatique.',
      history:
        "<b>Historique de courses et factures</b> : 10 ans (obligation comptable).",
      location:
        '<b>Données de localisation</b> détaillées : 12 mois maximum, puis agrégation anonymisée.',
      voip: "<b>Métadonnées d'appels VoIP</b> : 12 mois.",
      security: '<b>Logs de sécurité</b> : 12 mois.',
      documents:
        '<b>Documents chauffeurs vérifiés</b> : durée du contrat + 5 ans.',
    },
    s7: {
      title: '7. Vos droits (RGPD)',
      intro: 'Vous disposez à tout moment des droits suivants :',
      access: "<b>Droit d'accès</b> à vos données.",
      rectification: '<b>Droit de rectification</b> de données inexactes.',
      erasure: "<b>Droit à l'effacement</b> (« droit à l'oubli »).",
      restriction: '<b>Droit à la limitation</b> du traitement.',
      portability:
        '<b>Droit à la portabilité</b> de vos données dans un format structuré.',
      objection:
        "<b>Droit d'opposition</b> au traitement basé sur l'intérêt légitime.",
      withdraw: '<b>Droit de retirer votre consentement</b> à tout moment.',
      postMortem:
        '<b>Droit de définir des directives post-mortem</b> concernant vos données.',
      exerciseBefore: 'Pour exercer ces droits, écrivez-nous à',
      exerciseAfter:
        "avec une preuve d'identité. Nous répondons sous 30 jours maximum.",
      deleteBefore:
        "Vous pouvez également supprimer votre compte directement depuis l'application : <i>Profil → Paramètres → Supprimer mon compte</i>, ou en ligne sur",
      complaintBefore:
        'Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire une réclamation auprès de la <b>CNIL</b> :',
    },
    s8: {
      title: '8. Sécurité des données',
      tls: 'Chiffrement TLS 1.2+ pour toutes les communications.',
      storage:
        'Données stockées chez Google Cloud (Firebase), certifié ISO 27001, ISO 27017, ISO 27018, SOC 2.',
      mfa: 'Authentification multi-facteurs disponible (téléphone, email).',
      access:
        'Accès aux données limité aux personnels habilités, avec journalisation.',
      payments: 'Paiements traités par Stripe (PCI-DSS niveau 1).',
    },
    s9: {
      title: '9. Permissions Android et iOS',
      location: '<b>Localisation</b> : trouver les chauffeurs, suivre la course.',
      background:
        '<b>Localisation en arrière-plan</b> : chauffeurs uniquement, pendant une course active.',
      microphone:
        '<b>Microphone</b> : appels VoIP avec votre interlocuteur (jamais enregistrés).',
      camera:
        '<b>Caméra et photos</b> : photo de profil, scan de documents, preuve de livraison.',
      notifications:
        '<b>Notifications</b> : alertes de course, messages, paiements.',
      bluetooth:
        '<b>Bluetooth</b> : connexion à un kit mains-libres pour les appels.',
      revoke:
        "Vous pouvez révoquer chaque permission à tout moment depuis les paramètres de votre appareil.",
    },
    s10: {
      title: '10. Mineurs',
      text: "Les Services ne sont pas destinés aux personnes de moins de <b>18 ans</b>. Nous ne collectons pas sciemment de données de mineurs. Si vous découvrez qu'un mineur a créé un compte, contactez-nous : nous le supprimerons.",
    },
    s11: {
      title: '11. Cookies et traceurs (site web)',
      text: "Le site web utilise uniquement des cookies strictement nécessaires (session, sécurité, préférences). Les cookies analytiques ne sont déposés qu'après votre consentement explicite via le bandeau prévu à cet effet.",
    },
    s12: {
      title: '12. Modifications de la politique',
      text: "Nous pouvons mettre à jour cette politique pour refléter des évolutions légales ou techniques. La date de dernière mise à jour figure en haut de cette page. En cas de modification substantielle, nous vous notifierons via l'application ou par e-mail au moins 30 jours avant l'entrée en vigueur.",
    },
    s13: {
      title: '13. Contact',
      intro: 'Pour toute question relative à vos données :',
      personal: '📧 Données personnelles :',
      support: '📧 Support général :',
      site: '🌐 Site :',
    },
  },
  terms: {
    metaTitle: "Conditions générales d'utilisation — Medjira",
    metaDescription:
      "Conditions générales d'utilisation de l'application Medjira (taxi, livraison de repas et de colis).",
    title: "Conditions générales d'utilisation",
    lastUpdated: 'Dernière mise à jour : {date}',
    updatedDate: '6 mai 2026',
    s1: {
      title: '1. Objet',
      text: "Les présentes Conditions Générales d'Utilisation (« CGU ») régissent l'accès et l'utilisation de l'application mobile et du site web Medjira (les « Services ») édités par <b>{company}</b>. En créant un compte ou en utilisant les Services, vous acceptez sans réserve les présentes CGU.",
    },
    s2: {
      title: '2. Éditeur',
      siteLabel: 'Site :',
      contactLabel: 'Contact :',
    },
    s3: {
      title: '3. Nature du service',
      text1:
        "Medjira est une <b>plateforme de mise en relation</b> entre des utilisateurs (clients) et des prestataires indépendants (chauffeurs VTC/taxi, livreurs, restaurateurs). Medjira <b>n'est pas un transporteur</b>, ni un restaurateur, et n'exécute pas elle-même les courses, livraisons ou prestations de restauration.",
      text2:
        "Les prestataires sont seuls responsables de l'exécution de leurs prestations, du respect des réglementations applicables (transport, hygiène, assurance), et de leur situation fiscale et sociale.",
    },
    s4: {
      title: '4. Inscription et compte',
      age: "L'inscription est réservée aux personnes majeures (18 ans révolus) capables juridiquement.",
      accuracy:
        "Vous garantissez l'exactitude des informations fournies et vous engagez à les tenir à jour.",
      credentials:
        'Vous êtes responsable de la confidentialité de vos identifiants. Toute action réalisée depuis votre compte est réputée effectuée par vous.',
      drivers:
        'Les chauffeurs doivent fournir des documents valides (permis, assurance, carte professionnelle le cas échéant) et acceptent leur vérification.',
    },
    s5: {
      title: '5. Tarification, paiement, annulation',
      pricingTitle: '5.1 Tarifs',
      pricing:
        "Le prix de chaque course ou livraison est calculé avant validation, en fonction de la distance, de la durée estimée, du type de service et d'une éventuelle majoration tarifaire (heures de pointe, événements). Le prix affiché avant confirmation est ferme, sauf modification du trajet à votre initiative.",
      paymentTitle: '5.2 Paiement',
      payment:
        "Les paiements en ligne sont traités exclusivement par <b>Stripe Payments Europe</b> (norme PCI-DSS niveau 1). Medjira ne stocke jamais les numéros de carte. Le paiement en espèces est possible auprès du chauffeur lorsqu'il est proposé.",
      cancellationTitle: '5.3 Annulation',
      cancelFree:
        "Annulation gratuite dans un délai défini après la réservation et avant l'arrivée du chauffeur.",
      cancelFee:
        "Au-delà, des frais d'annulation peuvent être appliqués (montant indiqué dans l'application).",
      noShow:
        'En cas de no-show (absence du client après arrivée du chauffeur), des frais forfaitaires peuvent être facturés.',
      refundTitle: '5.4 Remboursement',
      refundBefore:
        'Les demandes de remboursement (course non effectuée, facturation incorrecte) sont à adresser à',
      refundAfter:
        'sous 14 jours. Les remboursements éligibles sont crédités sur le moyen de paiement initial sous 5 à 10 jours ouvrés.',
    },
    s6: {
      title: '6. Obligations des utilisateurs',
      intro: 'Vous vous engagez à :',
      o1: 'utiliser les Services conformément à leur destination et à la réglementation en vigueur ;',
      o2: 'ne pas perturber le fonctionnement des Services (intrusion, contournement de sécurité, scraping, bot) ;',
      o3: 'ne pas utiliser les Services à des fins illicites, frauduleuses ou portant atteinte à autrui ;',
      o4: 'respecter les chauffeurs, livreurs et autres utilisateurs ; tout comportement violent, harcelant ou discriminatoire pourra entraîner la suspension du compte ;',
      o5: "ne pas transporter de marchandises illégales, dangereuses, ou contraires aux conditions d'assurance.",
    },
    s7: {
      title: '7. Responsabilité',
      intro:
        "Medjira agit en qualité d'<b>intermédiaire technique</b> et ne saurait être tenue responsable :",
      l1: "des dommages causés lors de l'exécution des prestations par les prestataires indépendants (couverts par leurs propres assurances) ;",
      l2: 'des indisponibilités temporaires des Services (maintenance, incidents tiers, force majeure) ;',
      l3: "des incidents de paiement résultant d'un dysfonctionnement de Stripe ou de votre établissement bancaire.",
      limit:
        "La responsabilité de Medjira, lorsqu'elle est engagée, est limitée au montant de la course ou livraison concernée.",
    },
    s8: {
      title: '8. Données personnelles',
      before: 'Le traitement de vos données est décrit dans notre',
      privacyLink: 'Politique de confidentialité',
      middle:
        ". Vous pouvez à tout moment supprimer votre compte depuis l'application (Profil → Supprimer mon compte) ou via la page publique",
    },
    s9: {
      title: '9. Propriété intellectuelle',
      text: "Le nom Medjira, le logo, les éléments graphiques, l'interface, les textes et le code source sont la propriété exclusive de {company}. Toute reproduction, représentation ou exploitation non autorisée est interdite.",
    },
    s10: {
      title: '10. Suspension et résiliation',
      text: "Medjira peut suspendre ou résilier un compte en cas de manquement grave aux présentes CGU, de fraude avérée, ou de comportement portant atteinte à la sécurité des autres utilisateurs. La suspension est notifiée par e-mail. Vous pouvez résilier votre compte à tout moment depuis l'application.",
    },
    s11: {
      title: '11. Modification des CGU',
      text: "Medjira peut modifier les CGU pour refléter des évolutions légales, techniques ou commerciales. Les modifications substantielles vous seront notifiées au moins 30 jours avant leur entrée en vigueur. La poursuite de l'usage des Services vaut acceptation des nouvelles CGU.",
    },
    s12: {
      title: '12. Droit applicable et juridiction',
      before:
        'Les présentes CGU sont soumises au <b>droit français</b>. À défaut de résolution amiable, tout litige sera porté devant les juridictions françaises compétentes, conformément aux règles de droit commun. Le consommateur peut recourir gratuitement à la <b>plateforme européenne de règlement en ligne des litiges</b> :',
    },
    s13: {
      title: '13. Contact',
      support: '📧 Support :',
      legal: '⚖️ Questions juridiques :',
    },
  },
  deleteAccount: {
    metaTitle: 'Supprimer mon compte — Medjira',
    metaDescription:
      'Demande de suppression de compte Medjira. Procédure conforme RGPD et exigences Google Play.',
    title: 'Supprimer mon compte Medjira',
    application: 'Application : <b>{app}</b> — Éditeur : {company}',
    privacyLink: 'Politique de confidentialité',
    termsLink: 'CGU',
    inApp: {
      title: "✅ Méthode recommandée — directement dans l'application",
      intro:
        "Si vous avez encore accès à votre compte, la suppression est <b>immédiate</b> depuis l'application Medjira :",
      step1: "Ouvrez l'application Medjira",
      step2: "Allez dans l'onglet <b>Profil</b>",
      step3: "Faites défiler jusqu'à <b>« Supprimer mon compte »</b> en bas de l'écran",
      step4: "Confirmez votre choix dans la fenêtre qui s'affiche",
      irreversible: 'La suppression est définitive et irréversible.',
    },
    noAccess: {
      title: 'Vous ne pouvez plus accéder à votre compte ?',
      intro:
        'Utilisez le formulaire ci-dessous pour demander la suppression par e-mail. Notre équipe traitera votre demande sous <b>30 jours maximum</b> (article 12 RGPD), généralement sous 7 jours ouvrés.',
      indicate: 'Pour traiter votre demande, indiquez :',
      item1: "l'adresse e-mail du compte ;",
      item2: 'le numéro de téléphone associé (au format international, ex. +33...) ;',
      item3: 'le type de compte (client, chauffeur, restaurateur).',
      verification:
        "Une vérification d'identité pourra vous être demandée pour éviter toute suppression frauduleuse.",
      sendButton: '✉️ Envoyer ma demande à {email}',
      fallback: 'Si le bouton ne fonctionne pas, écrivez directement à',
    },
    deleted: {
      title: 'Quelles données sont supprimées ?',
      intro: "La suppression entraîne l'effacement définitif de :",
      profile: 'votre profil (nom, prénom, e-mail, téléphone, photo) ;',
      auth: "vos identifiants d'authentification Firebase ;",
      addresses: 'vos adresses enregistrées et préférences ;',
      payment:
        'vos moyens de paiement enregistrés (le détachement des cartes Stripe est effectué chez notre prestataire de paiement) ;',
      messages: 'vos messages de la messagerie intégrée ;',
      push: 'vos jetons de notification push (FCM).',
    },
    kept: {
      title: 'Quelles données sont conservées ?',
      intro: 'Certaines données doivent légalement être conservées au-delà de la suppression du compte :',
      invoices:
        "<b>Factures et historique de courses</b> : conservés <b>10 ans</b> (obligation comptable — art. L.123-22 Code de commerce), sous une forme dissociée de votre identité.",
      voip: "<b>Métadonnées d'appels VoIP</b> (date, durée — pas le contenu) : <b>12 mois</b>.",
      security: '<b>Logs de sécurité</b> : <b>12 mois</b>.',
      documents: '<b>Documents réglementaires des chauffeurs vérifiés</b> : durée du contrat + 5 ans.',
      more: 'Plus de détails dans notre',
    },
    timing: {
      title: 'Délai de traitement',
      inApp: '<b>Suppression in-app</b> : immédiate.',
      email: '<b>Demande par e-mail</b> : sous 30 jours maximum, en principe sous 7 jours ouvrés.',
      confirmation: 'Vous recevrez un e-mail de confirmation une fois la suppression effectuée.',
    },
    contact: {
      title: 'Une question ?',
      privacy: '📧 Données personnelles :',
      support: '📧 Support général :',
      complaint:
        'Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire une réclamation auprès de la <b>CNIL</b> :',
    },
    mailSubject: 'Demande de suppression de compte Medjira',
    mailBody:
      "Bonjour,\n\nJe demande la suppression définitive de mon compte Medjira et de l'ensemble des données personnelles associées, conformément à l'article 17 du RGPD.\n\nIdentifiants du compte (à compléter) :\n- Adresse e-mail du compte : \n- Numéro de téléphone associé : \n- Type de compte (client / chauffeur / restaurateur) : \n\nJe certifie être le titulaire du compte concerné.\n\nCordialement,",
    enSummary: {
      title: '🌐 English Summary — How to delete your account',
      intro:
        'In compliance with Google Play and Apple guidelines, you can delete your account and personal data at any time:',
      step1: 'Open the <b>Medjira</b> app',
      step2: 'Go to the <b>Profile</b> tab',
      step3: 'Scroll down to <b>“Delete my account”</b>',
      step4: 'Confirm your choice in the dialog prompt',
      noAccess: 'If you can no longer log in, send your deletion request to',
      noAccessDetails:
        'including your registered email, phone number, and user role. Requests are processed within 30 days maximum.',
    },
  },
} as const;
