import { getAdminHeaderNavItemClassName } from './adminHeaderUi';

describe('getAdminHeaderNavItemClassName', () => {
  it('prevents mobile navigation buttons from shrinking below their labels', () => {
    const className = getAdminHeaderNavItemClassName(false);

    expect(className).toContain('shrink-0');
    expect(className).toContain('whitespace-nowrap');
  });
});
