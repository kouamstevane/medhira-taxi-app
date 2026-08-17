import { render, screen } from '@testing-library/react';
import { BottomNav, adminNavItems, portalNavItems } from '../BottomNav';

let mockPathname = '/admin/drivers';

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

jest.mock('../MaterialIcon', () => ({
  MaterialIcon: ({ name }: { name: string }) => <span>{name}</span>,
}));

describe('BottomNav', () => {
  it('laisse le défilement passer autour des liens et réserve sa hauteur', () => {
    render(<BottomNav items={adminNavItems} />);

    const navigation = screen.getByRole('navigation');

    expect(navigation).toHaveClass('pointer-events-none');
    expect(screen.getAllByRole('link')[0]).toHaveClass('pointer-events-auto');
    expect(screen.getByTestId('bottom-nav-spacer')).toHaveClass('h-20');
  });

  it('adds Paramètres as the fourth portal destination', () => {
    expect(portalNavItems('restaurant-1').at(-1)).toEqual({
      href: '/food/portal/settings?restaurantId=restaurant-1',
      icon: 'settings',
      label: 'Paramètres',
    });
  });

  it.each([
    ['/food/portal', 'Dashboard'],
    ['/food/portal/orders', 'Commandes'],
  ])('highlights %s when the portal link has a restaurant query', (currentPath, activeLabel) => {
    mockPathname = currentPath;

    render(<BottomNav items={portalNavItems('restaurant-1')} />);

    expect(screen.getByRole('link', { name: new RegExp(activeLabel) })).toHaveClass('text-primary');
  });
});
