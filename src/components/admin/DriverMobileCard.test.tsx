import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DriverMobileCard } from './DriverMobileCard';
import type { Driver } from '@/app/admin/drivers/page';

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>{name}</span>,
}));

const mockDriver: Driver = {
  id: 'driver-123',
  firstName: 'William',
  lastName: 'Tewe',
  email: 'william@example.com',
  phone: '+33612345678',
  status: 'approved',
  driverType: 'chauffeur',
  licenseNumber: 'FR-998877',
  city: 'Paris',
  car: {
    model: 'Toyota Prius',
    plate: 'AA-123-BB',
    color: 'Noir',
  },
  createdAt: Date.now(),
};

describe('DriverMobileCard', () => {
  it('renders driver information clearly on mobile without horizontal overflow', () => {
    const onSelect = jest.fn();
    render(
      <DriverMobileCard
        driver={mockDriver}
        onSelect={onSelect}
        statusBadge={<span data-testid="status-badge">Approuvé</span>}
      />
    );

    expect(screen.getByText('William Tewe')).toBeInTheDocument();
    expect(screen.getByText('WT')).toBeInTheDocument();
    expect(screen.getByText('Chauffeur')).toBeInTheDocument();
    expect(screen.getByText('Toyota Prius')).toBeInTheDocument();
    expect(screen.getByText(/AA-123-BB/)).toBeInTheDocument();
    expect(screen.getByTestId('status-badge')).toBeInTheDocument();
  });

  it('triggers onSelect when the card is pressed', () => {
    const onSelect = jest.fn();
    render(
      <DriverMobileCard
        driver={mockDriver}
        onSelect={onSelect}
        statusBadge={<span>Approuvé</span>}
      />
    );

    const cardButton = screen.getByRole('button', { name: /Détails du chauffeur William Tewe/i });
    fireEvent.click(cardButton);

    expect(onSelect).toHaveBeenCalledWith(mockDriver);
  });

  it('renders suspended indicator when driver is suspended', () => {
    const suspendedDriver: Driver = {
      ...mockDriver,
      status: 'suspended',
      isSuspended: true,
    };

    render(
      <DriverMobileCard
        driver={suspendedDriver}
        onSelect={jest.fn()}
        statusBadge={<span data-testid="status-badge">Hors ligne</span>}
      />
    );

    expect(screen.getByText('Suspendu')).toBeInTheDocument();
    expect(screen.getByTestId('status-badge')).toHaveTextContent('Hors ligne');
  });
});
