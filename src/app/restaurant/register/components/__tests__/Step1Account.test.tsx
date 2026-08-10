import { render, screen } from '@testing-library/react';
import { Step1Account } from '../Step1Account';

describe('Step1Account', () => {
  it('uses shared field and primary action styling for account creation', () => {
    render(<Step1Account onSubmit={jest.fn()} loading={false} error={null} />);

    expect(screen.getByLabelText('Prénom')).toHaveClass('autofill-dark');
    expect(screen.getByLabelText('Nom')).toHaveClass('focus:ring-[#f29200]');
    expect(screen.getByLabelText('Email')).toHaveClass('rounded-xl');
    expect(screen.getByLabelText('Mot de passe')).toHaveClass('glass-input');
    expect(screen.getByLabelText('Téléphone (optionnel)')).toHaveClass('h-14');
    expect(screen.getByRole('button', { name: /Créer le compte et continuer/i })).toHaveClass('from-[#f29200]');
  });
});
