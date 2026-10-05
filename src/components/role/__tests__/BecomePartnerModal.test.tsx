import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BecomePartnerModal } from '../BecomePartnerModal';

describe('BecomePartnerModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    hasDriverRole: false,
    hasRestaurantRole: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <BecomePartnerModal {...defaultProps} isOpen={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders partner modal with driver/courier and restaurant options', () => {
    render(<BecomePartnerModal {...defaultProps} />);

    expect(screen.getByText(/Devenir partenaire/i)).toBeInTheDocument();
    expect(screen.getByText(/Chauffeur ou Livreur/i)).toBeInTheDocument();
    expect(screen.getByText(/Commerçant ou marchand/i)).toBeInTheDocument();
  });

  it('displays already registered badges when user already has roles', () => {
    render(
      <BecomePartnerModal
        {...defaultProps}
        hasDriverRole={true}
        hasRestaurantRole={true}
      />
    );

    const badges = screen.getAllByText(/Déjà inscrit/i);
    expect(badges.length).toBe(2);
  });

  it('calls onClose when close button is clicked', () => {
    render(<BecomePartnerModal {...defaultProps} />);

    const closeButtons = screen.getAllByRole('button', { name: /Fermer/i });
    fireEvent.click(closeButtons[closeButtons.length - 1]);

    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
