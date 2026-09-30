import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DriverInviteModal } from './DriverInviteModal';

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>{name}</span>,
}));

describe('DriverInviteModal', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <DriverInviteModal
        isOpen={false}
        onClose={jest.fn()}
        email=""
        onEmailChange={jest.fn()}
        role="chauffeur"
        onRoleChange={jest.fn()}
        onSubmit={jest.fn()}
        isLoading={false}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders input fields, transitions to confirmation step, and submits on final confirmation', () => {
    const handleSubmit = jest.fn((e) => e.preventDefault());
    const handleEmailChange = jest.fn();
    const handleClose = jest.fn();

    render(
      <DriverInviteModal
        isOpen={true}
        onClose={handleClose}
        email="test@example.com"
        onEmailChange={handleEmailChange}
        role="chauffeur"
        onRoleChange={jest.fn()}
        onSubmit={handleSubmit}
        isLoading={false}
      />
    );

    expect(screen.getByRole('heading', { name: /Inviter un chauffeur/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Email du postulant/i)).toHaveValue('test@example.com');

    // Step 1: Click "Continuer vers l’envoi"
    const continueBtn = screen.getByRole('button', { name: /Continuer vers l[’']envoi/i });
    expect(continueBtn).toBeEnabled();
    fireEvent.click(continueBtn);

    // Step 2: Confirmation view is shown
    expect(screen.getByRole('heading', { name: /Confirmer l[’']envoi de l[’']invitation/i })).toBeInTheDocument();
    expect(screen.getByText(/Validation de l[’']envoi/i)).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /Confirmer et envoyer l[’']email/i });
    expect(confirmBtn).toBeEnabled();

    fireEvent.click(confirmBtn);
    expect(handleSubmit).toHaveBeenCalledTimes(1);
  });

  it('allows going back to modify details from the confirmation step', () => {
    render(
      <DriverInviteModal
        isOpen={true}
        onClose={jest.fn()}
        email="candidate@example.com"
        onEmailChange={jest.fn()}
        role="livreur"
        onRoleChange={jest.fn()}
        onSubmit={jest.fn()}
        isLoading={false}
      />
    );

    // Advance to confirmation step
    fireEvent.click(screen.getByRole('button', { name: /Continuer vers l[’']envoi/i }));
    expect(screen.getByText(/Validation de l[’']envoi/i)).toBeInTheDocument();

    // Click "Modifier" to return to step 1
    const modifyBtn = screen.getByRole('button', { name: /Modifier/i });
    fireEvent.click(modifyBtn);

    expect(screen.getByRole('heading', { name: /Inviter un chauffeur/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Email du postulant/i)).toBeInTheDocument();
  });

  it('allows closing via the close button', () => {
    const handleClose = jest.fn();

    render(
      <DriverInviteModal
        isOpen={true}
        onClose={handleClose}
        email=""
        onEmailChange={jest.fn()}
        role="chauffeur"
        onRoleChange={jest.fn()}
        onSubmit={jest.fn()}
        isLoading={false}
      />
    );

    const closeBtn = screen.getByRole('button', { name: 'Fermer' });
    fireEvent.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('uses the shared BottomSheet with gesture handle and accessible panel', () => {
    render(
      <DriverInviteModal
        isOpen={true}
        onClose={jest.fn()}
        email="test@example.com"
        onEmailChange={jest.fn()}
        role="chauffeur"
        onRoleChange={jest.fn()}
        onSubmit={jest.fn()}
        isLoading={false}
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByTestId('bottom-sheet-handle')).toBeInTheDocument();
    expect(screen.getByTestId('driver-invite-panel')).toBeInTheDocument();
    expect(screen.getByLabelText(/Email du postulant/i)).not.toHaveFocus();
  });

  it('allows selecting role via interactive touch options without unexpected unmount', () => {
    const handleRoleChange = jest.fn();

    render(
      <DriverInviteModal
        isOpen={true}
        onClose={jest.fn()}
        email="test@example.com"
        onEmailChange={jest.fn()}
        role="chauffeur"
        onRoleChange={handleRoleChange}
        onSubmit={jest.fn()}
        isLoading={false}
      />
    );

    const livreurRadio = screen.getByRole('radio', { name: 'Livreur' });
    fireEvent.click(livreurRadio);
    expect(handleRoleChange).toHaveBeenCalledWith('livreur');
  });

  it('disables continue button when email is empty', () => {
    render(
      <DriverInviteModal
        isOpen={true}
        onClose={jest.fn()}
        email="   "
        onEmailChange={jest.fn()}
        role="chauffeur"
        onRoleChange={jest.fn()}
        onSubmit={jest.fn()}
        isLoading={false}
      />
    );

    const continueBtn = screen.getByRole('button', { name: /Continuer vers l[’']envoi/i });
    expect(continueBtn).toBeDisabled();
  });
});
