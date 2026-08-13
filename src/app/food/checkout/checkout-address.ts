export const PROFILE_ADDRESS_PLACEHOLDER = 'Veuillez définir votre adresse dans le profil';

export function getInitialCheckoutAddress(profileAddress: string | null | undefined, placeholder = PROFILE_ADDRESS_PLACEHOLDER): string {
  const normalizedAddress = profileAddress?.trim() ?? '';
  return normalizedAddress && normalizedAddress !== placeholder ? normalizedAddress : '';
}

export function getInitialCheckoutInputValue(): string {
  return '';
}

export function isCheckoutAddressValid(address: string): boolean {
  const length = address.trim().length;
  return length >= 5 && length <= 500;
}

export function isProfileAddressSelected(checkoutAddress: string, profileAddress: string): boolean {
  return checkoutAddress.trim() !== '' && checkoutAddress.trim() === profileAddress.trim();
}
