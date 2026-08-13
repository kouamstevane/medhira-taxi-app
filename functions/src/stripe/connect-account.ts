export type ConnectAccountRole = 'restaurant' | 'driver';
type BusinessProfileRole = 'restaurant' | 'driver' | 'delivery' | 'mixed';

type ConnectBusinessProfile = Record<string, string>;
type ConnectIndividual = Record<string, unknown>;

interface BuildBusinessProfileInput {
  role: BusinessProfileRole;
  country: string;
  name?: string;
  productDescription?: string;
  supportEmail?: string;
  supportPhone?: string;
}

export interface BuildConnectAccountParamsInput {
  role: ConnectAccountRole;
  country: string;
  email: string;
  individual?: ConnectIndividual;
  businessProfile: ConnectBusinessProfile;
  metadata: Record<string, string>;
}

const MEDJIRA_BUSINESS_PROFILE = {
  url: 'https://medjira-service.firebaseapp.com',
  supportEmail: 'medjira@medjira.com',
  mccTaxi: '4121',
  mccDelivery: '4215',
  mccRestaurant: '5812',
  productDescriptionTaxi: 'Service de transport de personnes via l’application Medjira.',
  productDescriptionDelivery: 'Service de livraison de repas et colis via l’application Medjira.',
  productDescriptionMixed: 'Services de transport de personnes et de livraison via l’application Medjira.',
  productDescriptionRestaurant: 'Restaurant et vente de repas via l’application Medjira.',
} as const;

const COUNTRY_DIAL_CODE: Record<string, string> = {
  CA: '1',
  US: '1',
  FR: '33',
  BE: '32',
  CM: '237',
};

function safeString(value: string | undefined, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : undefined;
}

function safeEmail(value: string | undefined): string | undefined {
  const email = safeString(value, 320);
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
}

export function toE164(raw: string | undefined, country: string): string | undefined {
  const value = safeString(raw, 30);
  if (!value) return undefined;

  if (value.startsWith('+')) {
    const digits = value.slice(1).replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : undefined;
  }

  const digits = value.replace(/\D/g, '');
  const dialCode = COUNTRY_DIAL_CODE[country.toUpperCase()];
  if (!digits || !dialCode) return undefined;

  const nationalNumber = digits.startsWith('0') ? digits.slice(1) : digits;
  const normalized = nationalNumber.startsWith(dialCode)
    ? nationalNumber
    : `${dialCode}${nationalNumber}`;
  return normalized.length >= 8 && normalized.length <= 15 ? `+${normalized}` : undefined;
}

export function buildBusinessProfile({
  role,
  name,
  productDescription,
  supportEmail,
  supportPhone,
  country,
}: BuildBusinessProfileInput): ConnectBusinessProfile {
  const defaults = {
    restaurant: {
      mcc: MEDJIRA_BUSINESS_PROFILE.mccRestaurant,
      productDescription: MEDJIRA_BUSINESS_PROFILE.productDescriptionRestaurant,
    },
    driver: {
      mcc: MEDJIRA_BUSINESS_PROFILE.mccTaxi,
      productDescription: MEDJIRA_BUSINESS_PROFILE.productDescriptionTaxi,
    },
    delivery: {
      mcc: MEDJIRA_BUSINESS_PROFILE.mccDelivery,
      productDescription: MEDJIRA_BUSINESS_PROFILE.productDescriptionDelivery,
    },
    mixed: {
      mcc: MEDJIRA_BUSINESS_PROFILE.mccTaxi,
      productDescription: MEDJIRA_BUSINESS_PROFILE.productDescriptionMixed,
    },
  }[role];

  const profile: ConnectBusinessProfile = {
    mcc: defaults.mcc,
    product_description: safeString(productDescription, 500) ?? defaults.productDescription,
    url: MEDJIRA_BUSINESS_PROFILE.url,
    support_email: safeEmail(supportEmail) ?? MEDJIRA_BUSINESS_PROFILE.supportEmail,
  };

  const safeName = safeString(name, 100);
  if (safeName) profile.name = safeName;

  const normalizedPhone = toE164(supportPhone, country);
  if (normalizedPhone) profile.support_phone = normalizedPhone;

  return profile;
}

export function buildConnectAccountParams({
  role,
  country,
  email,
  individual,
  businessProfile,
  metadata,
}: BuildConnectAccountParamsInput): Record<string, unknown> {
  const common = {
    country,
    email,
    business_profile: businessProfile,
    metadata,
  };

  if (role === 'restaurant') {
    return {
      ...common,
      type: 'express',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    };
  }

  return {
    ...common,
    controller: {
      stripe_dashboard: { type: 'none' },
      fees: { payer: 'application' },
      losses: { payments: 'application' },
      requirement_collection: 'application',
    },
    capabilities: { transfers: { requested: true } },
    business_type: 'individual',
    individual: individual ?? { email },
  };
}
