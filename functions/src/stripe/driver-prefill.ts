import { toE164 } from './connect-account.js';

interface DriverIndividualInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  dob?: string;
}

interface BuildDriverIndividualPrefillInput {
  tokenEmail: string;
  country: string;
  requestIndividual?: DriverIndividualInput;
  driverData?: {
    driverType?: 'chauffeur' | 'livreur' | 'les_deux';
    firstName?: string;
    lastName?: string;
    phone?: string;
    phoneNumber?: string;
    city?: string;
    zipCode?: string;
  } | null;
  privateData?: {
    dob?: string;
    address?: string;
    province?: string;
  } | null;
}

interface StripeDob {
  day: number;
  month: number;
  year: number;
}

export interface DriverIndividualPrefillResult {
  firstName?: string;
  lastName?: string;
  rawPhone?: string;
  phone?: string;
  dob: StripeDob | null;
  individual: Record<string, unknown>;
}

interface StripeAddress {
  line1?: string;
  city?: string;
  postal_code?: string;
  state?: string;
  country?: string;
}

function getDriverJobTitle(driverType?: 'chauffeur' | 'livreur' | 'les_deux'): string | undefined {
  switch (driverType) {
    case 'chauffeur':
      return 'Chauffeur professionnel';
    case 'livreur':
      return 'Livreur professionnel';
    case 'les_deux':
      return 'Chauffeur et livreur professionnel';
    default:
      return undefined;
  }
}

function safeStr(value: unknown, maxLen = 100): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLen ? trimmed : undefined;
}

function parseStripeDob(iso: string | undefined): StripeDob | null {
  if (!iso || typeof iso !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > new Date().getFullYear()) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  return { day, month, year };
}

export function buildDriverIndividualPrefill({
  tokenEmail,
  country,
  requestIndividual,
  driverData,
  privateData,
}: BuildDriverIndividualPrefillInput): DriverIndividualPrefillResult {
  const firstName = safeStr(requestIndividual?.firstName) ?? safeStr(driverData?.firstName);
  const lastName = safeStr(requestIndividual?.lastName) ?? safeStr(driverData?.lastName);
  const rawPhone = safeStr(requestIndividual?.phone, 30) ?? safeStr(driverData?.phone, 30) ?? safeStr(driverData?.phoneNumber, 30);
  const phone = toE164(rawPhone, country);
  const dob = parseStripeDob(requestIndividual?.dob ?? privateData?.dob);
  const line1 = safeStr(privateData?.address, 200);
  const city = safeStr(driverData?.city, 100);
  const postalCode = safeStr(driverData?.zipCode, 30);
  const state = safeStr(privateData?.province, 100);
  const countryCode = safeStr(country, 2)?.toUpperCase();
  const jobTitle = getDriverJobTitle(driverData?.driverType);

  const individual: Record<string, unknown> = {
    email: tokenEmail,
  };

  if (firstName) individual.first_name = firstName;
  if (lastName) individual.last_name = lastName;
  if (phone) individual.phone = phone;
  if (dob) individual.dob = dob;

  const address: StripeAddress = {};
  if (line1) address.line1 = line1;
  if (city) address.city = city;
  if (postalCode) address.postal_code = postalCode;
  if (state) address.state = state;
  if (line1 || city || postalCode || state) {
    if (countryCode) address.country = countryCode;
    individual.address = address;
  }

  if (jobTitle) {
    individual.relationship = { title: jobTitle };
  }

  return {
    firstName,
    lastName,
    rawPhone,
    phone,
    dob,
    individual,
  };
}
