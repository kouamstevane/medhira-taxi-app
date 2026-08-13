import { CHECKOUT_FOOTER_CLASS, PROFILE_ADDRESS_EDIT_HREF, getFoodCheckoutErrorMessage } from '../checkout-ui';

describe('checkout layout', () => {
  it('links the missing address action directly to the address editor', () => {
    expect(PROFILE_ADDRESS_EDIT_HREF).toBe('/profil?edit=address');
  });

  it('keeps the payment footer above the bottom navigation', () => {
    expect(CHECKOUT_FOOTER_CLASS).toContain('bottom-20');
  });

  it('maps callable validation errors to an actionable French message', () => {
    expect(getFoodCheckoutErrorMessage({ code: 'invalid-argument', message: 'Données de commande invalides.' })).toBe(
      'Vérifiez votre adresse et les informations de commande, puis réessayez.'
    );
  });
});
