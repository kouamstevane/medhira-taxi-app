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

  it('has only the first accordion open on initial arrival and no Section suivante flags', () => {
    render(<Step3Restaurant onNext={jest.fn()} onBack={jest.fn()} loading={false} />);

    // First accordion (Activité) is open
    const activityHeader = screen.getByRole('button', { name: /Activité/i });
    expect(activityHeader).toHaveAttribute('aria-expanded', 'true');

    // Other accordions are closed
    const infoHeader = screen.getByRole('button', { name: /Informations/i });
    expect(infoHeader).toHaveAttribute('aria-expanded', 'false');

    const locationHeader = screen.getByRole('button', { name: /Coordonnées/i });
    expect(locationHeader).toHaveAttribute('aria-expanded', 'false');

    const visualsHeader = screen.getByRole('button', { name: /Visuels/i });
    expect(visualsHeader).toHaveAttribute('aria-expanded', 'false');

    // No "Section suivante" flag anywhere in the document
    expect(screen.queryByText(/Section suivante/i)).not.toBeInTheDocument();
  });

  it('enforces mutually exclusive accordions: opening one accordion automatically closes any previously open accordion', () => {
    render(<Step3Restaurant onNext={jest.fn()} onBack={jest.fn()} loading={false} />);

    const activityHeader = screen.getByRole('button', { name: /Activité/i });
    const infoHeader = screen.getByRole('button', { name: /Informations/i });
    const locationHeader = screen.getByRole('button', { name: /Coordonnées/i });
    const visualsHeader = screen.getByRole('button', { name: /Visuels/i });

    // Initially: Activité is open, others closed
    expect(activityHeader).toHaveAttribute('aria-expanded', 'true');
    expect(infoHeader).toHaveAttribute('aria-expanded', 'false');
    expect(locationHeader).toHaveAttribute('aria-expanded', 'false');
    expect(visualsHeader).toHaveAttribute('aria-expanded', 'false');

    // Opening Informations closes Activité
    fireEvent.click(infoHeader);
    expect(activityHeader).toHaveAttribute('aria-expanded', 'false');
    expect(infoHeader).toHaveAttribute('aria-expanded', 'true');
    expect(locationHeader).toHaveAttribute('aria-expanded', 'false');
    expect(visualsHeader).toHaveAttribute('aria-expanded', 'false');

    // Opening Coordonnées closes Informations
    fireEvent.click(locationHeader);
    expect(activityHeader).toHaveAttribute('aria-expanded', 'false');
    expect(infoHeader).toHaveAttribute('aria-expanded', 'false');
    expect(locationHeader).toHaveAttribute('aria-expanded', 'true');
    expect(visualsHeader).toHaveAttribute('aria-expanded', 'false');

    // Opening Visuels closes Coordonnées
    fireEvent.click(visualsHeader);
    expect(activityHeader).toHaveAttribute('aria-expanded', 'false');
    expect(infoHeader).toHaveAttribute('aria-expanded', 'false');
    expect(locationHeader).toHaveAttribute('aria-expanded', 'false');
    expect(visualsHeader).toHaveAttribute('aria-expanded', 'true');

    // Clicking already open Visuels closes it (0 open)
    fireEvent.click(visualsHeader);
    expect(visualsHeader).toHaveAttribute('aria-expanded', 'false');
  });

  it('uses shared fields and navigation actions when sections are expanded', () => {
    render(<Step3Restaurant onNext={jest.fn()} onBack={jest.fn()} loading={false} />);

    // Open remaining sections to view all fields
    fireEvent.click(screen.getByRole('button', { name: /Informations/i }));
    fireEvent.click(screen.getByRole('button', { name: /Coordonnées/i }));
    fireEvent.click(screen.getByRole('button', { name: /Visuels/i }));

    expect(screen.getByLabelText('Nom du restaurant')).toHaveClass('glass-input');
    expect(screen.getByLabelText('Description')).toHaveClass('focus:ring-[#f29200]');
    expect(screen.getByLabelText('Téléphone')).toHaveClass('h-14');
    expect(screen.getByLabelText('Email')).toHaveClass('rounded-xl');
    expect(screen.getByLabelText(/Prix moyen par personne/i)).toHaveClass('autofill-dark');
    expect(screen.getByRole('button', { name: /Retour/i })).toHaveClass('border-white/10');
    expect(screen.getByRole('button', { name: /Continuer/i })).toHaveClass('from-[#f29200]');
  });

  it('keeps cuisine choices as pressed toggle buttons when section is open', () => {
    render(<Step3Restaurant onNext={jest.fn()} onBack={jest.fn()} loading={false} />);

    // Open info section
    fireEvent.click(screen.getByRole('button', { name: /Informations/i }));
    fireEvent.click(screen.getByRole('button', { name: /Visuels/i }));

    expect(screen.getByRole('button', { name: 'Pizza' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('Choisir le logo')).toBeInTheDocument();
    expect(screen.getByLabelText('Choisir la photo de couverture')).toBeInTheDocument();
  });

  it('focuses the validation error so it is visible after clicking continue and auto-opens incomplete section', async () => {
    const onNext = jest.fn();
    render(<Step3Restaurant onNext={onNext} onBack={jest.fn()} loading={false} />);

    fireEvent.click(screen.getByRole('button', { name: /Continuer/i }));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("Le nom de l'établissement est requis.");
    await waitFor(() => expect(alert).toHaveFocus());
    expect(onNext).not.toHaveBeenCalled();

    // Verification: info section automatically opened upon validation error
    const infoHeader = screen.getByRole('button', { name: /Informations/i });
    expect(infoHeader).toHaveAttribute('aria-expanded', 'true');
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

    // Open info and location sections
    fireEvent.click(screen.getByRole('button', { name: /Informations/i }));
    fireEvent.click(screen.getByRole('button', { name: /Coordonnées/i }));

    fireEvent.change(screen.getByLabelText('Nom du restaurant'), { target: { value: '  Pizzeria Roma  ' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: '  Des pizzas napolitaines préparées chaque jour.  ' } });
    fireEvent.change(screen.getByLabelText('Téléphone'), { target: { value: '  +33 1 42 00 00 00  ' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: '  contact@roma.fr  ' } });
    fireEvent.change(screen.getByLabelText("Adresse de l'établissement"), { target: { value: '  12 Rue de la Paix, Paris  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pizza' }));
    fireEvent.click(screen.getByRole('button', { name: /Continuer/i }));

    await waitFor(() => {
      expect(onNext).toHaveBeenCalledWith({
        name: 'Pizzeria Roma',
        description: 'Des pizzas napolitaines préparées chaque jour.',
        merchantType: 'restaurant',
        fulfillmentModes: ['delivery', 'pickup'],
        cuisineType: ['Pizza'],
        address: '12 Rue de la Paix, Paris',
        phone: '+33 1 42 00 00 00',
        email: 'contact@roma.fr',
        avgPricePerPerson: undefined,
        location: { lat: 48.8566, lng: 2.3522 },
      });
    });
  });

  it('displays contextual categories when switching to supermarket or pharmacy', () => {
    render(<Step3Restaurant onNext={jest.fn()} onBack={jest.fn()} loading={false} />);

    // Open info section to see categories
    fireEvent.click(screen.getByRole('button', { name: /Informations/i }));

    // Switch to supermarket
    fireEvent.click(screen.getByRole('button', { name: /^Épicerie/i }));

    expect(screen.getByRole('button', { name: 'Fruits & Légumes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Boissons/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Nom de l'établissement/i)).toBeInTheDocument();

    // Switch to pharmacy
    fireEvent.click(screen.getByRole('button', { name: /^Pharmacie/i }));

    expect(screen.getByRole('button', { name: /Cosmétiques/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Premiers secours/i })).toBeInTheDocument();
  });

  it('enforces a maximum of 5 predefined categories and does not allow arbitrary free-text input', () => {
    render(<Step3Restaurant onNext={jest.fn()} onBack={jest.fn()} loading={false} />);

    // Open info section
    fireEvent.click(screen.getByRole('button', { name: /Informations/i }));

    // Verify custom text input is not present
    expect(screen.queryByPlaceholderText(/Ex\. Sans gluten/i)).not.toBeInTheDocument();

    // Select 5 categories
    fireEvent.click(screen.getByRole('button', { name: 'Pizza' }));
    fireEvent.click(screen.getByRole('button', { name: 'Burger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fast Food' }));
    fireEvent.click(screen.getByRole('button', { name: 'Grillades' }));
    fireEvent.click(screen.getByRole('button', { name: 'Desserts' }));

    expect(screen.getByText('5/5')).toBeInTheDocument();

    // Attempting to select a 6th category should trigger error
    fireEvent.click(screen.getByRole('button', { name: 'Italien' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Vous ne pouvez pas sélectionner plus de 5 catégories au total/i);
    expect(screen.getByRole('button', { name: 'Italien' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows confirmation dialog when changing merchant type if categories are already selected', () => {
    render(<Step3Restaurant onNext={jest.fn()} onBack={jest.fn()} loading={false} />);

    // Open info section and select a category
    fireEvent.click(screen.getByRole('button', { name: /Informations/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Burger' }));
    expect(screen.getByRole('button', { name: 'Burger' })).toHaveAttribute('aria-pressed', 'true');

    // Attempt to switch to Épicerie
    fireEvent.click(screen.getByRole('button', { name: /^Épicerie/i }));

    // Confirmation dialog should appear
    expect(screen.getByText("Changer d'activité ?")).toBeInTheDocument();

    // Cancel change
    fireEvent.click(screen.getByRole('button', { name: /Annuler/i }));
    expect(screen.getByRole('button', { name: 'Burger' })).toHaveAttribute('aria-pressed', 'true');

    // Click again and confirm change
    fireEvent.click(screen.getByRole('button', { name: /^Épicerie/i }));
    fireEvent.click(screen.getByRole('button', { name: /Confirmer le changement/i }));

    // Burger should no longer be pressed, and supermarket categories should appear
    expect(screen.getByRole('button', { name: 'Fruits & Légumes' })).toBeInTheDocument();
  });
});
