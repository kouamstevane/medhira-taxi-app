import { render, screen } from '@testing-library/react';
import { BottomNav, adminNavItems, portalNavItems } from '../BottomNav';

let mockPathname = '/admin/drivers';

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

jest.mock('../MaterialIcon', () => ({
  MaterialIcon: ({ name, filled }: { name: string; filled?: boolean }) => (
    <span data-filled={filled ? 'true' : 'false'}>{name}</span>
  ),
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

  it('highlights only the most specific portal destination on nested routes', () => {
    mockPathname = '/food/portal/orders/';

    render(<BottomNav items={portalNavItems('restaurant-1')} />);

    expect(screen.getByRole('link', { name: /Dashboard/ })).not.toHaveClass('text-primary');
    expect(screen.getByRole('link', { name: /Commandes/ })).toHaveClass('text-primary');
  });

  it('keeps the active navbar icon outlined instead of filling its shape', () => {
    mockPathname = '/food/portal/orders';

    render(<BottomNav items={portalNavItems('restaurant-1')} />);

    expect(screen.getByText('receipt_long')).toHaveAttribute('data-filled', 'false');
  });
});
