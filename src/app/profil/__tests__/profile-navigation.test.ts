import { shouldOpenAddressEditor } from '../profile-navigation';

describe('profile navigation', () => {
  it('opens the address editor from the checkout address action', () => {
    expect(shouldOpenAddressEditor('?edit=address')).toBe(true);
  });

  it('does not open the address editor for other profile views', () => {
    expect(shouldOpenAddressEditor('?edit=personal')).toBe(false);
  });
});
