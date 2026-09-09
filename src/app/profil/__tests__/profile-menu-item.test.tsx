import { render, screen, fireEvent } from '@testing-library/react';
import { ProfileMenuItem } from '../ProfileMenuItem';

describe('ProfileMenuItem', () => {
  it('renders title, subtitle and optional badge', () => {
    render(
      <ProfileMenuItem
        icon="bolt"
        iconColorVariant="sky"
        title="Mode Chauffeur"
        subtitle="Passer en mode conducteur"
        badge="Nouveau"
      />
    );

    expect(screen.getByText('Mode Chauffeur')).toBeInTheDocument();
    expect(screen.getByText('Passer en mode conducteur')).toBeInTheDocument();
    expect(screen.getByText('Nouveau')).toBeInTheDocument();
  });

  it('triggers onClick when clicked as button', () => {
    const handleClick = jest.fn();
    render(
      <ProfileMenuItem
        icon="person"
        title="Informations personnelles"
        onClick={handleClick}
      />
    );

    const item = screen.getByRole('button');
    fireEvent.click(item);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders as a link when href is provided', () => {
    render(
      <ProfileMenuItem
        icon="wallet"
        title="Wallet & Paiement"
        href="/wallet"
      />
    );

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/wallet');
  });
});
