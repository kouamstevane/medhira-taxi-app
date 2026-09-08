import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DriverInviteModal } from './DriverInviteModal';

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>{name}</span>,
}));

describe('DriverInviteModal', () => {
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

  it('renders input fields and submits form when valid', () => {
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

    const submitBtn = screen.getByRole('button', { name: /Envoyer l[’']invitation/i });
    expect(submitBtn).toBeEnabled();

    fireEvent.click(submitBtn);
    expect(handleSubmit).toHaveBeenCalled();
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

  it('uses a bottom sheet on mobile and stays centered on larger screens', () => {
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
    expect(dialog).toHaveClass('items-end', 'sm:items-center', 'p-0', 'sm:p-4', 'z-[60]');
    const panel = screen.getByTestId('driver-invite-panel');
    expect(panel).toHaveClass('rounded-t-3xl', 'rounded-b-none', 'sm:rounded-2xl');
    expect(screen.getByTestId('driver-invite-handle')).toBeInTheDocument();
    expect(screen.getByLabelText(/Email du postulant/i)).not.toHaveFocus();
  });

  it('makes the final action explicitly about sending the invitation', () => {
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

    expect(screen.getByRole('button', { name: /Envoyer l[’']invitation/i })).toBeInTheDocument();
  });
});
