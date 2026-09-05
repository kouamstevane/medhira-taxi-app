import { render, screen } from '@testing-library/react';
import AdminHeader from './AdminHeader';

jest.mock('next/navigation', () => ({
  usePathname: () => '/admin/drivers',
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: ({ name }: { name: string }) => <span aria-hidden="true">{name}</span>,
}));

describe('AdminHeader', () => {
  it('keeps only the client dashboard action in the admin header', () => {
    render(<AdminHeader title="Candidatures & conducteurs" subtitle="Suivi des conducteurs" />);

    const dashboardButton = screen.getByRole('button', { name: 'Retourner au dashboard client' });

    expect(dashboardButton).toHaveClass('shrink-0');
    expect(dashboardButton).toHaveClass('min-h-10');
    expect(screen.queryByTestId('admin-navigation-scroll')).not.toBeInTheDocument();
  });

  it('does not duplicate destinations already available in the fixed bottom navigation', () => {
    render(<AdminHeader title="Administration Personal Driver" subtitle="Gestion des forfaits" />);

    expect(screen.getByRole('button', { name: 'Retourner au dashboard client' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Utilisateurs' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Chauffeurs' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restaurants' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Personal Driver' })).not.toBeInTheDocument();
  });

  it('keeps the subtitle readable in the compact header', () => {
    render(<AdminHeader title="Validation Restaurants" subtitle="Gérez les demandes d'adhésion des restaurateurs" />);

    const subtitle = screen.getByText("Gérez les demandes d'adhésion des restaurateurs");

    expect(subtitle).toHaveClass('text-slate-300');
    expect(subtitle).not.toHaveClass('truncate');
  });
});
