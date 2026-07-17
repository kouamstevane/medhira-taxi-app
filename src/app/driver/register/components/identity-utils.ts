import { SUPPORTED_COUNTRIES } from '@/utils/constants';
import type { Country } from '@/types/user';

const countriesByDialCode = [...SUPPORTED_COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length);

function normalizeText(value?: string | null): string {
  return value?.trim().toLowerCase() ?? '';
}

export function getCountryByCode(countryCode?: string | null): Country | null {
  const normalized = normalizeText(countryCode).toUpperCase();
  if (!normalized) return null;
  return SUPPORTED_COUNTRIES.find((country) => country.code === normalized) ?? null;
}

export function getCountryByName(countryName?: string | null): Country | null {
  const normalized = normalizeText(countryName);
  if (!normalized) return null;
  return SUPPORTED_COUNTRIES.find((country) => normalizeText(country.name) === normalized) ?? null;
}

export function getCountryByDialCode(dialCode?: string | null): Country | null {
  const normalized = normalizeText(dialCode);
  if (!normalized) return null;
  return SUPPORTED_COUNTRIES.find((country) => normalizeText(country.dialCode) === normalized) ?? null;
}

export function getDialCodeForCountryCode(countryCode?: string | null): string {
  return getCountryByCode(countryCode)?.dialCode ?? '';
}

export function getDialCodeForCountryName(countryName?: string | null): string {
  return getCountryByName(countryName)?.dialCode ?? '';
}

export function getCountryCodeFromDialCode(phone?: string | null): string | null {
  if (!phone) return null;
  const cleanPhone = phone.replace(/[^\d+]/g, '');
  const match = countriesByDialCode.find((country) => cleanPhone.startsWith(country.dialCode));
  return match?.code ?? null;
}

export function getDialCodeFromPhone(phone?: string | null): string | null {
  const countryCode = getCountryCodeFromDialCode(phone);
  return countryCode ? getDialCodeForCountryCode(countryCode) : null;
}
