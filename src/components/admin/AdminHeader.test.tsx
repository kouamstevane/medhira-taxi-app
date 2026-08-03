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
  it('keeps the client dashboard action visible outside the scrollable admin tabs', () => {
    render(<AdminHeader title="Candidatures & conducteurs" subtitle="Suivi des conducteurs" />);

    const dashboardButton = screen.getByRole('button', { name: 'Retourner au dashboard client' });
    const scrollableTabs = screen.getByTestId('admin-navigation-scroll');

    expect(dashboardButton).toHaveClass('shrink-0');
    expect(scrollableTabs).not.toContainElement(dashboardButton);
  });
});
