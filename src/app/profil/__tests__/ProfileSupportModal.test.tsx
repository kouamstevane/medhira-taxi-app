import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfileSupportModal } from '../ProfileSupportModal';

describe('ProfileSupportModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ProfileSupportModal {...defaultProps} isOpen={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders support channels with WhatsApp, phone, and email', () => {
    render(<ProfileSupportModal {...defaultProps} />);

    expect(screen.getByText(/Service Client/i)).toBeInTheDocument();
    expect(screen.getByText(/WhatsApp Support/i)).toBeInTheDocument();
    expect(screen.getByText(/Appel Téléphonique/i)).toBeInTheDocument();
    expect(screen.getByText(/Support par Email/i)).toBeInTheDocument();
    expect(screen.getByText('24/7')).toBeInTheDocument();
  });

  it('renders channel links with appropriate hrefs', () => {
    render(<ProfileSupportModal {...defaultProps} />);

    const whatsappLink = screen.getByRole('link', { name: /WhatsApp Support/i });
    expect(whatsappLink).toHaveAttribute('href', expect.stringContaining('wa.me/237693372118'));

    const phoneLink = screen.getByRole('link', { name: /Appel Téléphonique/i });
    expect(phoneLink).toHaveAttribute('href', 'tel:+237693372118');

    const emailLink = screen.getByRole('link', { name: /Support par Email/i });
    expect(emailLink).toHaveAttribute('href', expect.stringContaining('mailto:support@medjira.com'));
  });

  it('calls onClose when close button is clicked', () => {
    render(<ProfileSupportModal {...defaultProps} />);

    const closeButtons = screen.getAllByRole('button', { name: /Fermer/i });
    fireEvent.click(closeButtons[closeButtons.length - 1]);

    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
