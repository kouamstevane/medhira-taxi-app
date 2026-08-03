import { render, screen } from '@testing-library/react';
import { BottomNav, adminNavItems } from '../BottomNav';

jest.mock('next/navigation', () => ({
  usePathname: () => '/admin/drivers',
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
});
