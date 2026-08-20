import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Step3Restaurant } from '../Step3Restaurant';

jest.mock('@/hooks/useGoogleMaps', () => ({
  useGoogleMaps: () => ({ autocompleteService: null }),
}));

jest.mock('@/app/taxi/components/AddressInput', () => ({
  AddressInput: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => (
    <label>
      {label}
      <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  ),
}));

describe('Step3Restaurant', () => {
  let originalGoogleDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalGoogleDescriptor = Object.getOwnPropertyDescriptor(window, 'google');
  });

  afterEach(() => {
    if (originalGoogleDescriptor) {
      Object.defineProperty(window, 'google', originalGoogleDescriptor);
    } else {
      Reflect.deleteProperty(window, 'google');
    }
  });

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
    expect(screen.getByLabelText('Choisir le logo')).toBeInTheDocument();
    expect(screen.getByLabelText('Choisir la photo de couverture')).toBeInTheDocument();
  });

  it('shows the existing restaurant name validation error instead of advancing an empty form', () => {
    const onNext = jest.fn();
    render(<Step3Restaurant onNext={onNext} onBack={jest.fn()} loading={false} />);

    fireEvent.click(screen.getByRole('button', { name: /Continuer aux horaires/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('Le nom du restaurant est requis.');
    expect(onNext).not.toHaveBeenCalled();
  });

  it('submits edited restaurant details with the geocoded address location', async () => {
    const onNext = jest.fn();
    Object.defineProperty(window, 'google', {
      configurable: true,
      value: {
        maps: {
          Geocoder: jest.fn().mockImplementation(() => ({
            geocode: jest.fn().mockResolvedValue({
              results: [{
                geometry: {
                  location: {
                    lat: () => 48.8566,
                    lng: () => 2.3522,
                  },
                },
              }],
            }),
          })),
        },
      },
    });
    render(<Step3Restaurant onNext={onNext} onBack={jest.fn()} loading={false} />);

    fireEvent.change(screen.getByLabelText('Nom du restaurant'), { target: { value: '  Pizzeria Roma  ' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: '  Des pizzas napolitaines préparées chaque jour.  ' } });
    fireEvent.change(screen.getByLabelText('Téléphone'), { target: { value: '  +33 1 42 00 00 00  ' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: '  contact@roma.fr  ' } });
    fireEvent.change(screen.getByLabelText('Adresse du restaurant'), { target: { value: '  12 Rue de la Paix, Paris  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pizza' }));
    fireEvent.click(screen.getByRole('button', { name: /Continuer aux horaires/i }));

    await waitFor(() => {
      expect(onNext).toHaveBeenCalledWith({
        name: 'Pizzeria Roma',
        description: 'Des pizzas napolitaines préparées chaque jour.',
        cuisineType: ['Pizza'],
        address: '12 Rue de la Paix, Paris',
        phone: '+33 1 42 00 00 00',
        email: 'contact@roma.fr',
        avgPricePerPerson: undefined,
        location: { lat: 48.8566, lng: 2.3522 },
      });
    });
  });
});
