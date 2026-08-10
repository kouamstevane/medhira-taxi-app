import { render, screen } from '@testing-library/react';
import { Step3Restaurant } from '../Step3Restaurant';

jest.mock('@/hooks/useGoogleMaps', () => ({
  useGoogleMaps: () => ({ autocompleteService: null }),
}));

jest.mock('@/app/taxi/components/AddressInput', () => ({
  AddressInput: ({ label }: { label: string }) => (
    <label>
      {label}
      <input aria-label={label} />
    </label>
  ),
}));

describe('Step3Restaurant', () => {
  it('uses shared fields and navigation actions', () => {
    render(<Step3Restaurant onNext={jest.fn()} onBack={jest.fn()} loading={false} />);

    expect(screen.getByLabelText('Nom du restaurant')).toHaveClass('glass-input');
    expect(screen.getByLabelText('Description')).toHaveClass('focus:ring-[#f29200]');
    expect(screen.getByLabelText('Téléphone')).toHaveClass('h-14');
    expect(screen.getByLabelText('Email')).toHaveClass('rounded-xl');
    expect(screen.getByLabelText(/Prix moyen par personne/i)).toHaveClass('autofill-dark');
    expect(screen.getByRole('button', { name: /Retour à l'étape précédente/i })).toHaveClass('border-white/10');
    expect(screen.getByRole('button', { name: /Continuer aux horaires/i })).toHaveClass('from-[#f29200]');
  });

  it('keeps cuisine choices as pressed toggle buttons', () => {
    render(<Step3Restaurant onNext={jest.fn()} onBack={jest.fn()} loading={false} />);

    expect(screen.getByRole('button', { name: 'Pizza' })).toHaveAttribute('aria-pressed', 'false');
  });
});
