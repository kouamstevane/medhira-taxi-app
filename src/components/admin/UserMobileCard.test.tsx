import React from 'react';
import { render, screen } from '@testing-library/react';
import { UserMobileCard } from './UserMobileCard';

describe('UserMobileCard', () => {
  it('keeps the mobile user card compact without an internal divider', () => {
    render(
      <UserMobileCard
        user={{
          id: 'restaurant-doc',
          firstName: 'Olive',
          lastName: 'Manick',
          email: 'olive@example.com',
          phoneNumber: '693372118',
          roles: ['restaurant', 'client'],
          roleUserIds: { restaurant: 'restaurant-doc', client: 'client-doc' },
        }}
        isProcessing={false}
        isDisabled={false}
        onRemoveRole={jest.fn()}
        onSelect={jest.fn()}
      />,
    );

    const card = screen.getByText('Olive Manick').closest('article');

    expect(card).toHaveClass('rounded-xl', 'px-3', 'py-2.5');
    expect(card).not.toHaveClass('border', 'p-4', 'shadow-sm');
    expect(card?.querySelector('[class*="border-t"]')).toBeNull();
    expect(screen.getAllByText('Olive Manick')).toHaveLength(1);
    expect(screen.getByText('Restaurateur')).toBeInTheDocument();
    expect(screen.getByText('Client')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retirer accès restaurateur' })).toHaveClass(
      'min-h-9',
      'rounded-lg',
    );

    expect(screen.getByRole('button', { name: 'Ouvrir la fiche complète' })).toBeInTheDocument();
  });

  it('ne montre aucune action destructive pour un client seul', () => {
    render(
      <UserMobileCard
        user={{
          id: 'user-2',
          firstName: 'Tewe',
          lastName: 'Wilson',
          email: 'tewe@example.com',
          roles: ['client'],
          roleUserIds: { client: 'user-2' },
        }}
        isProcessing={false}
        isDisabled={false}
        onRemoveRole={jest.fn()}
        onSelect={jest.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /Retirer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Gérer dans Restaurants' })).not.toBeInTheDocument();
    expect(screen.queryByText('Aucune action administrative')).not.toBeInTheDocument();
  });

  it('expose le retrait du rôle chauffeur sans afficher une action restaurant', () => {
    render(
      <UserMobileCard
        user={{
          id: 'driver-doc',
          firstName: 'Medjira',
          lastName: 'Store',
          email: 'store@example.com',
          roles: ['driver', 'client'],
          roleUserIds: { driver: 'driver-doc', client: 'client-doc' },
        }}
        isProcessing={false}
        isDisabled={false}
        onRemoveRole={jest.fn()}
        onSelect={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Retirer accès chauffeur' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Gérer dans Restaurants' })).not.toBeInTheDocument();
  });
});
