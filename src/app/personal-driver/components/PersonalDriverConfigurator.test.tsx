import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PERSONAL_DRIVER_PLANS } from '@/services/personal-driver/plans';
import { PersonalDriverConfigurator } from './PersonalDriverConfigurator';
import { estimateRoadDistanceKm } from '@/services/personal-driver/distance.service';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/app/taxi/components/AddressInput', () => ({
  AddressInput: ({ label, value, onChange, disabled, error }: {
    label: string;
    value: string;
    onChange: (nextValue: string) => void;
    disabled?: boolean;
    error?: string;
  }) => (
    <div>
      <label>
        {label}
        <input
          aria-label={label}
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      {error && <p>{error}</p>}
    </div>
  ),
}));

jest.mock('@/hooks/useGoogleMaps', () => ({
  useGoogleMaps: () => ({ autocompleteService: null }),
}));

jest.mock('@/services/personal-driver/distance.service', () => ({
  estimateRoadDistanceKm: jest.fn(),
}));

const estimateRoadDistanceKmMock = jest.mocked(estimateRoadDistanceKm);

describe('PersonalDriverConfigurator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  it('disables Saturday and Sunday for the Basic plan', () => {
    render(<PersonalDriverConfigurator plan={PERSONAL_DRIVER_PLANS.basic} />);

    expect(screen.getByLabelText('Samedi')).toBeDisabled();
    expect(screen.getByLabelText('Dimanche')).toBeDisabled();
  });

  it('requires a return time for a round trip', async () => {
    const user = userEvent.setup();
    estimateRoadDistanceKmMock.mockResolvedValue(12.4);
    render(<PersonalDriverConfigurator plan={PERSONAL_DRIVER_PLANS.classic} />);

    await fillRequiredFields(user);
    await user.click(screen.getByLabelText('Aller-retour'));
    await user.click(screen.getByRole('button', { name: 'Calculer la distance' }));
    await user.click(screen.getByRole('button', { name: 'Continuer vers l estimation' }));

    expect(screen.getByText("L'heure de retour est requise pour un aller-retour.")).toBeVisible();
  });

  it('requires all mandatory trip details and a positive distance', async () => {
    const user = userEvent.setup();
    render(<PersonalDriverConfigurator plan={PERSONAL_DRIVER_PLANS.basic} />);

    await user.click(screen.getByRole('button', { name: 'Continuer vers l estimation' }));

    expect(screen.getByText("L'adresse de depart est requise.")).toBeVisible();
    expect(screen.getByText('La destination est requise.')).toBeVisible();
    expect(screen.getByText('Choisissez au moins un jour.')).toBeVisible();
    expect(screen.getByText("L'heure de depart est requise.")).toBeVisible();
    expect(screen.getByText('La date de debut est requise.')).toBeVisible();
    expect(screen.getByText('Calculez une distance positive avant de continuer.')).toBeVisible();
  });

  it('stores a valid configuration and proceeds to the estimate', async () => {
    const user = userEvent.setup();
    estimateRoadDistanceKmMock.mockResolvedValue(12.4);
    render(<PersonalDriverConfigurator plan={PERSONAL_DRIVER_PLANS.classic} />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Calculer la distance' }));
    await waitFor(() => expect(screen.getByText('12,4 km')).toBeVisible());
    await user.click(screen.getByRole('button', { name: 'Continuer vers l estimation' }));

    expect(mockPush).toHaveBeenCalledWith('/personal-driver/estimation');

    const stored = JSON.parse(sessionStorage.getItem('medjira.personalDriver.config.v1') ?? '{}');
    expect(stored).toMatchObject({
      planId: 'classic',
      pickupAddress: 'Aeroport de Yaounde',
      destinationAddress: 'Bastos, Yaounde',
      tripType: 'one_way',
      weekdays: [1],
      departureTime: '08:00',
      startDate: '2026-08-03',
      passengerCount: 2,
      distanceKm: 12.4,
    });
    expect(stored.requestId).toEqual(expect.any(String));
  });
});

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Adresse de depart'), 'Aeroport de Yaounde');
  await user.type(screen.getByLabelText('Destination'), 'Bastos, Yaounde');
  await user.click(screen.getByLabelText('Lundi'));
  fireEvent.change(screen.getByLabelText('Heure de depart'), { target: { value: '08:00' } });
  fireEvent.change(screen.getByLabelText('Date de debut'), { target: { value: '2026-08-03' } });
  fireEvent.change(screen.getByLabelText('Nombre de passagers'), { target: { value: '2' } });
}
