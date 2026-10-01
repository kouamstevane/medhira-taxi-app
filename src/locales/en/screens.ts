export const screens = {
  stripeReturn: {
    redirecting: 'Redirecting from Stripe…',
  },
  parcelTracking: {
    description: 'Description',
  },
  driverRegister: {
    codeLabel: 'Code:',
  },
  menuManagement: {
    webpPreviewAlt: 'WebP preview',
    compressionFailed: 'Image compression failed',
    defaultCategories: {
      starters: 'Starters',
      mains: 'Main dishes',
      desserts: 'Desserts',
      drinks: 'Drinks',
      sides: 'Sides',
      snacks: 'Snacks',
    },
  },
  driverDashboard: {
    forSomeoneElse: 'For someone else',
  },
  profilePayment: {
    expires: 'EXPIRES',
  },
  login: {
    availableCountries: 'Available countries',
  },
  restaurantRegister: {
    dismissAlert: 'Dismiss alert',
  },
  roleSwitcher: {
    changeSpace: 'Switch space',
  },
  rideForm: {
    userIdRequired: 'User ID is required',
    invalidEmail: 'Invalid email',
    pickupTooShort: 'Pickup address is too short (min. 5 characters)',
    destinationTooShort: 'Destination address is too short (min. 5 characters)',
    distancePositive: 'Distance must be positive',
    durationPositive: 'Duration must be positive',
    pricePositive: 'Price must be positive',
    vehicleTypeRequired: 'Vehicle type is required',
  },
  setupPayment: {
    setupFailed: 'Your card setup failed. Check the information and try again.',
    setupIncomplete: 'Your card setup is not complete. Please try again.',
    returnIncomplete: 'Incomplete return from Stripe. Please try again.',
    stripeUnavailable: 'Stripe is unavailable. Please try again.',
  },
  onboardingGate: {
    deletionIncomplete: 'The account deletion could not be completed. Please try again.',
    sessionExpired: 'Session expired. Sign in again and retry.',
  },
  orderRejection: {
    fromCustomer: ' from {name}',
  },
  profileSupport: {
    whatsappMessage: 'Hello Medjira, I need assistance',
    emailSubject: 'Medjira Support Request',
  },
  dateInput: {
    dayPlaceholder: 'DD',
    yearPlaceholder: 'YYYY',
  },
  personalDriverPlan: {
    choose: 'Choose {name}',
  },
  orderFilterGroups: {
    all: 'All',
    to_process: 'To process',
    preparing: 'Preparing',
    in_delivery: 'In delivery',
    completed: 'Completed',
  },
  orderStatus: {
    all: 'All',
    pending_payment: 'Pending payment',
    pending: 'Pending',
    confirmed: 'Confirmed',
    accepted: 'Accepted',
    preparing: 'Preparing',
    ready: 'Ready',
    driver_heading_to_restaurant: 'Driver en route',
    driver_arrived_restaurant: 'Driver at restaurant',
    picked_up: 'Picked up',
    out_for_delivery: 'Out for delivery',
    arriving: 'Driver nearby',
    delivering: 'Out for delivery',
    delivered: 'Delivered',
    no_driver_available: 'No driver available',
    cancelled: 'Cancelled',
    cancelled_by_restaurant: 'Declined by restaurant',
  },
  vehicleMeta: {
    eco: {
      tagline: 'Everyday rides at the best price',
      description:
        'A standard sedan for your everyday trips. Ideal for commuting, running errands, or meeting friends affordably.',
      highlight1: 'Up to 4 passengers',
      highlight2: 'Recent vehicle',
      highlight3: 'Most affordable fare',
    },
    confort: {
      tagline: 'More room, more peace of mind',
      description:
        'A spacious, well-maintained vehicle with top-rated drivers. Perfect for a quiet, comfortable, air-conditioned ride.',
      highlight1: 'Up to 4 passengers',
      highlight2: 'Top-rated drivers',
      highlight3: 'More space & comfort',
    },
    confortPlus: {
      tagline: 'The premium experience for your important trips',
      description:
        'High-end luxury sedan with elite chauffeur. For executive travel, special occasions, or supreme comfort.',
      highlight1: 'Up to 4 passengers',
      highlight2: 'Elite chauffeurs',
      highlight3: 'Premium comfort',
      highlight4: 'Meticulous attention to detail',
    },
    fallback: {
      tagline: 'Your ride',
      description: 'A vehicle for your trip.',
      highlight1: 'Standard ride',
    },
  },
} as const;
