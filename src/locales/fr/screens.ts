export const screens = {
  stripeReturn: {
    redirecting: 'Redirection depuis Stripe…',
  },
  parcelTracking: {
    description: 'Description',
  },
  driverRegister: {
    codeLabel: 'Code:',
  },
  menuManagement: {
    webpPreviewAlt: 'Aperçu WebP',
    compressionFailed: "Échec de la compression de l'image",
    defaultCategories: {
      starters: 'Entrées',
      mains: 'Plats',
      desserts: 'Desserts',
      drinks: 'Boissons',
      sides: 'Accompagnements',
      snacks: 'Snacks',
    },
  },
  driverDashboard: {
    forSomeoneElse: 'Pour un tiers',
  },
  profilePayment: {
    expires: 'EXPIRE',
  },
  login: {
    availableCountries: 'Pays disponibles',
  },
  restaurantRegister: {
    dismissAlert: "Fermer l'alerte",
  },
  roleSwitcher: {
    changeSpace: 'Changer d’espace',
  },
  rideForm: {
    userIdRequired: 'UID utilisateur requis',
    invalidEmail: 'Email invalide',
    pickupTooShort: 'Adresse de départ trop courte (min 5 caractères)',
    destinationTooShort: 'Adresse de destination trop courte (min 5 caractères)',
    distancePositive: 'La distance doit être positive',
    durationPositive: 'La durée doit être positive',
    pricePositive: 'Le prix doit être positif',
    vehicleTypeRequired: 'Type de véhicule requis',
  },
  setupPayment: {
    setupFailed: 'La configuration de votre carte a échoué. Vérifiez les informations et réessayez.',
    setupIncomplete: 'La configuration de votre carte n’est pas terminée. Réessayez.',
    returnIncomplete: 'Retour Stripe incomplet. Réessayez.',
    stripeUnavailable: 'Stripe est indisponible. Réessayez.',
  },
  onboardingGate: {
    deletionIncomplete: 'La suppression du compte n’a pas pu être terminée. Réessayez.',
    sessionExpired: 'Session expirée. Reconnectez-vous puis réessayez.',
  },
  orderRejection: {
    fromCustomer: ' de {name}',
  },
  profileSupport: {
    whatsappMessage: "Bonjour Medjira, j'ai besoin d'assistance",
    emailSubject: "Demande d'assistance Medjira",
  },
  dateInput: {
    dayPlaceholder: 'JJ',
    yearPlaceholder: 'AAAA',
  },
  personalDriverPlan: {
    choose: 'Choisir {name}',
  },
  orderFilterGroups: {
    all: 'Toutes',
    to_process: 'À traiter',
    preparing: 'En préparation',
    in_delivery: 'En livraison',
    completed: 'Terminées',
  },
  orderStatus: {
    all: 'Toutes',
    pending_payment: 'Paiement en attente',
    pending: 'En attente',
    confirmed: 'Confirmée',
    accepted: 'Acceptée',
    preparing: 'Préparation',
    ready: 'Prête',
    driver_heading_to_restaurant: 'Livreur en route',
    driver_arrived_restaurant: 'Livreur au resto',
    picked_up: 'Récupérée',
    out_for_delivery: 'En livraison',
    arriving: 'Livreur proche',
    delivering: 'En livraison',
    delivered: 'Livrée',
    no_driver_available: 'Aucun livreur',
    cancelled: 'Annulée',
    cancelled_by_restaurant: 'Refusée restaurant',
  },
  vehicleMeta: {
    eco: {
      tagline: 'La course du quotidien, au meilleur prix',
      description:
        'Une berline standard pour vos trajets de tous les jours. Idéale pour aller au travail, faire vos courses ou rejoindre vos amis sans vous ruiner.',
      highlight1: "Jusqu'à 4 passagers",
      highlight2: 'Véhicule récent',
      highlight3: 'Tarif le plus accessible',
    },
    confort: {
      tagline: "Plus d'espace, plus de tranquillité",
      description:
        'Une voiture spacieuse et bien entretenue avec un chauffeur mieux noté. Parfait quand vous voulez un trajet calme, climatisé et confortable sans payer le prix d’une berline premium.',
      highlight1: "Jusqu'à 4 passagers",
      highlight2: 'Chauffeurs mieux notés',
      highlight3: "Plus d'espace et plus de confort",
    },
    confortPlus: {
      tagline: "L'expérience premium, pour vos déplacements importants",
      description:
        'Berline haut de gamme avec chauffeur d’élite. Pour vos rendez-vous professionnels, vos sorties spéciales ou quand vous voulez voyager avec davantage de discrétion et de confort.',
      highlight1: "Jusqu'à 4 passagers",
      highlight2: "Chauffeurs d'élite",
      highlight3: 'Confort premium',
      highlight4: 'Attention renforcée aux détails',
    },
    fallback: {
      tagline: 'Votre course',
      description: 'Un véhicule pour votre trajet.',
      highlight1: 'Course standard',
    },
  },
} as const;
