import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfileFaqModal } from '../ProfileFaqModal';

describe('ProfileFaqModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<ProfileFaqModal isOpen={false} onClose={defaultProps.onClose} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the FAQ title and items when open', () => {
    render(<ProfileFaqModal {...defaultProps} />);

    expect(screen.getByText(/Foire aux questions/i)).toBeInTheDocument();
    expect(screen.getByText(/Comment réserver une course avec Medjira/i)).toBeInTheDocument();
    expect(screen.getByText(/Quels modes de paiement sont disponibles/i)).toBeInTheDocument();
    expect(screen.getByText(/Comment annuler une course/i)).toBeInTheDocument();
    expect(screen.getByText(/Comment devenir chauffeur ou livreur partenaire/i)).toBeInTheDocument();
    expect(screen.getByText(/Comment commander un repas ou envoyer un colis/i)).toBeInTheDocument();
    expect(screen.getByText(/Que faire en cas de problème ou d’objet oublié/i)).toBeInTheDocument();
  });

  it('first item is expanded by default and displays its answer', () => {
    render(<ProfileFaqModal {...defaultProps} />);

    expect(screen.getByText(/Depuis l’accueil, sélectionnez « Taxi VTC » ou « Personal Driver »/i)).toBeInTheDocument();
  });

  it('expands another item on click and toggles answer', () => {
    render(<ProfileFaqModal {...defaultProps} />);

    const paymentQuestion = screen.getByText(/Quels modes de paiement sont disponibles/i);
    fireEvent.click(paymentQuestion);

    expect(screen.getByText(/Vous pouvez payer par carte bancaire sécurisée via Stripe/i)).toBeInTheDocument();
  });

  it('calls onClose when clicking the close button', () => {
    render(<ProfileFaqModal {...defaultProps} />);

    const closeButtons = screen.getAllByRole('button', { name: /Fermer/i });
    fireEvent.click(closeButtons[0]);

    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
