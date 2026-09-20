import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProfileReferralModal } from '../ProfileReferralModal';

describe('ProfileReferralModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    referralCode: 'MED-ABC123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ProfileReferralModal {...defaultProps} isOpen={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders referral modal with referral code and explanations', () => {
    render(<ProfileReferralModal {...defaultProps} />);

    expect(screen.getByText(/Programme de Parrainage/i)).toBeInTheDocument();
    expect(screen.getByText('MED-ABC123')).toBeInTheDocument();
    expect(screen.getByText(/Votre code exclusif/i)).toBeInTheDocument();
    expect(screen.getByText(/Partagez ce code avec vos amis/i)).toBeInTheDocument();
  });

  it('handles copy action and updates button text', async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });

    render(<ProfileReferralModal {...defaultProps} />);

    const copyBtn = screen.getByRole('button', { name: /Copier mon code/i });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(screen.getByText(/Code copié/i)).toBeInTheDocument();
    });
  });

  it('calls onClose when close button is clicked', () => {
    render(<ProfileReferralModal {...defaultProps} />);

    const closeButtons = screen.getAllByRole('button', { name: /Fermer/i });
    fireEvent.click(closeButtons[closeButtons.length - 1]);

    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
