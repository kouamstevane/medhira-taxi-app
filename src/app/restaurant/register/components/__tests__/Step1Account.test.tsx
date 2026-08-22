import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Step1Account } from '../Step1Account';

describe('Step1Account', () => {
  it('uses shared field and primary action styling for account creation', () => {
    render(<Step1Account onSubmit={jest.fn()} loading={false} error={null} />);

    expect(screen.getByLabelText('Prénom')).toHaveClass('autofill-dark');
    expect(screen.getByLabelText('Nom')).toHaveClass('focus:ring-[#f29200]');
    expect(screen.getByLabelText('Email')).toHaveClass('rounded-xl');
    expect(screen.getByLabelText('Mot de passe')).toHaveClass('glass-input');
    expect(screen.getByLabelText('Téléphone')).toHaveClass('h-14');
    expect(screen.getByRole('button', { name: /Créer le compte et continuer/i })).toHaveClass('from-[#f29200]');
  });

  it('shows the existing name validation error instead of submitting an empty account form', () => {
    const onSubmit = jest.fn();
    render(<Step1Account onSubmit={onSubmit} loading={false} error={null} />);

    fireEvent.click(screen.getByRole('button', { name: /Créer le compte et continuer/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('Prénom et nom sont requis.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('allows the password to be shown and hidden without changing its value', () => {
    render(<Step1Account onSubmit={jest.fn()} loading={false} error={null} />);

    const password = screen.getByLabelText('Mot de passe');
    expect(password).toHaveAttribute('type', 'password');

    fireEvent.change(password, { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Afficher le mot de passe' }));

    expect(password).toHaveAttribute('type', 'text');
    expect(password).toHaveValue('password123');
    expect(screen.getByRole('button', { name: 'Masquer le mot de passe' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Masquer le mot de passe' }));
    expect(password).toHaveAttribute('type', 'password');
  });

  it('submits trimmed required account values without an optional phone number', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<Step1Account onSubmit={onSubmit} loading={false} error={null} />);

    fireEvent.change(screen.getByLabelText('Prénom'), { target: { value: '  Marie  ' } });
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: '  Curie ' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: '  marie@curie.fr  ' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Téléphone'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /Créer le compte et continuer/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        firstName: 'Marie',
        lastName: 'Curie',
        email: 'marie@curie.fr',
        password: 'password123',
      });
    });
  });
});
