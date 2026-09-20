import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProfilePaymentMethodsModal } from '../ProfilePaymentMethodsModal';

describe('ProfilePaymentMethodsModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    hasPaymentMethod: false,
    cardholderName: 'Jean Dupont',
    walletBalance: 25.50,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ProfilePaymentMethodsModal {...defaultProps} isOpen={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders empty state when hasPaymentMethod is false', () => {
    render(<ProfilePaymentMethodsModal {...defaultProps} hasPaymentMethod={false} />);

    expect(screen.getByText(/Moyens de paiement/i)).toBeInTheDocument();
    expect(screen.getByText(/Aucune carte bancaire enregistrée/i)).toBeInTheDocument();
    expect(screen.getByText(/Ajouter une carte/i)).toBeInTheDocument();
  });

  it('renders saved credit card with masked number and expiry when hasPaymentMethod is true', () => {
    render(
      <ProfilePaymentMethodsModal
        {...defaultProps}
        hasPaymentMethod={true}
        cardDetails={{
          last4: '4242',
          brand: 'visa',
          expMonth: 12,
          expYear: 2028,
        }}
        cardholderName="Jean Dupont"
      />
    );

    expect(screen.getByText(/•••• •••• •••• 4242/)).toBeInTheDocument();
    expect(screen.getByText(/VISA/)).toBeInTheDocument();
    expect(screen.getByText('12/28')).toBeInTheDocument();
    expect(screen.getByText('Jean Dupont')).toBeInTheDocument();
    expect(screen.getByText(/Par défaut/i)).toBeInTheDocument();
    expect(screen.getByText(/Modifier la carte/i)).toBeInTheDocument();
  });

  it('renders wallet balance and quick top up action', () => {
    render(<ProfilePaymentMethodsModal {...defaultProps} walletBalance={45.00} />);

    expect(screen.getByText(/Solde disponible/i)).toBeInTheDocument();
    expect(screen.getByText(/45(.*)CAD/i)).toBeInTheDocument();
    expect(screen.getByText(/Recharger/i)).toBeInTheDocument();
  });

  it('shows delete confirmation and triggers onRemoveCard when confirmed', async () => {
    const onRemoveCardMock = jest.fn().mockResolvedValue(undefined);
    render(
      <ProfilePaymentMethodsModal
        {...defaultProps}
        hasPaymentMethod={true}
        cardDetails={{ last4: '4242', brand: 'mastercard' }}
        onRemoveCard={onRemoveCardMock}
      />
    );

    const deleteBtn = screen.getByRole('button', { name: /Supprimer la carte/i });
    fireEvent.click(deleteBtn);

    expect(screen.getByText(/Êtes-vous sûr de vouloir supprimer cette carte/i)).toBeInTheDocument();

    const confirmDeleteBtn = screen.getByRole('button', { name: /^Supprimer$/i });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(onRemoveCardMock).toHaveBeenCalledTimes(1);
    });
  });

  it('calls onClose when close button is clicked', () => {
    render(<ProfilePaymentMethodsModal {...defaultProps} />);

    const closeButtons = screen.getAllByRole('button', { name: /Fermer/i });
    fireEvent.click(closeButtons[closeButtons.length - 1]);

    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
