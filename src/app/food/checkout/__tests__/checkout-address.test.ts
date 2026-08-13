import { getInitialCheckoutAddress, getInitialCheckoutInputValue, isCheckoutAddressValid, isProfileAddressSelected } from '../checkout-address';

describe('checkout address helpers', () => {
  it('uses a saved profile address as the initial checkout value', () => {
    expect(getInitialCheckoutAddress('12 Rue A', 'Veuillez définir votre adresse dans le profil')).toBe('12 Rue A');
  });

  it('does not treat the profile placeholder as an address', () => {
    expect(getInitialCheckoutAddress('Veuillez définir votre adresse dans le profil', 'Veuillez définir votre adresse dans le profil')).toBe('');
  });

  it('validates trimmed checkout addresses', () => {
    expect(isCheckoutAddressValid(' 12 Rue A ')).toBe(true);
    expect(isCheckoutAddressValid('   ')).toBe(false);
  });

  it('rejects addresses shorter than the callable contract', () => {
    expect(isCheckoutAddressValid('1234')).toBe(false);
  });

  it('accepts a trimmed address at the server minimum', () => {
    expect(isCheckoutAddressValid(' 12345 ')).toBe(true);
  });

  it('rejects addresses longer than the callable contract', () => {
    expect(isCheckoutAddressValid('a'.repeat(501))).toBe(false);
  });

  it('identifies when the saved profile address is selected', () => {
    expect(isProfileAddressSelected(' 12 Rue A ', '12 Rue A')).toBe(true);
    expect(isProfileAddressSelected('12 Rue B', '12 Rue A')).toBe(false);
    expect(isProfileAddressSelected('', '12 Rue A')).toBe(false);
  });

  it('keeps the checkout text input empty when a profile address exists', () => {
    expect(getInitialCheckoutInputValue()).toBe('');
  });
});
