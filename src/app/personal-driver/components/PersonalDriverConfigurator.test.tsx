import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { PERSONAL_DRIVER_PLANS } from '@/services/personal-driver/plans';
import { PersonalDriverConfigurator } from './PersonalDriverConfigurator';
import {
  DISTANCE_ESTIMATE_ERROR_MESSAGE,
  estimateRoadDistanceKm,
} from '@/services/personal-driver/distance.service';

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
  ...jest.requireActual('@/services/personal-driver/distance.service'),
  estimateRoadDistanceKm: jest.fn(),
}));

const estimateRoadDistanceKmMock = jest.mocked(estimateRoadDistanceKm);

describe('PersonalDriverConfigurator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses the browser local date as the earliest selectable start date', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 3, 12));

    render(<PersonalDriverConfigurator plan={PERSONAL_DRIVER_PLANS.classic} />);

    expect(screen.getByLabelText('Date de debut')).toHaveAttribute('min', '2026-08-03');
  });

  it('omits the browser-local date minimum from the initial server HTML', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 3, 12));

    const html = renderToString(<PersonalDriverConfigurator plan={PERSONAL_DRIVER_PLANS.classic} />);

    expect(html).not.toContain('min="2026-08-03"');
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

  it('shows inline feedback when the return time is not after departure', async () => {
    const user = userEvent.setup();
    estimateRoadDistanceKmMock.mockResolvedValue(12.4);
    render(<PersonalDriverConfigurator plan={PERSONAL_DRIVER_PLANS.classic} />);

    await fillRequiredFields(user);
    await user.click(screen.getByLabelText('Aller-retour'));
    fireEvent.change(screen.getByLabelText('Heure de retour'), { target: { value: '08:00' } });
    await user.click(screen.getByRole('button', { name: 'Calculer la distance' }));
    await user.click(screen.getByRole('button', { name: 'Continuer vers l estimation' }));

    expect(screen.getByText("L'heure de retour doit etre posterieure a l'heure de depart.")).toBeVisible();
    expect(document.querySelector('input[aria-describedby="return-time-error"]')).toHaveAttribute('aria-invalid', 'true');
    expect(mockPush).not.toHaveBeenCalled();
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
    const departureTimeInput = document.querySelector('input[type="time"]');
    expect(departureTimeInput).toHaveAttribute('aria-invalid', 'true');
    expect(departureTimeInput).toHaveAttribute(
      'aria-describedby',
      'departure-time-error',
    );

    expect(screen.getByLabelText('Adresse de depart')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Adresse de depart')).toHaveAttribute(
      'aria-describedby',
      'pickup-address-error',
    );
    expect(screen.getByLabelText('Destination')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Destination')).toHaveAttribute(
      'aria-describedby',
      'destination-address-error',
    );
    expect(screen.getByText("L'adresse de depart est requise.")).toHaveAttribute('role', 'alert');
    expect(screen.getByText('La destination est requise.')).toHaveAttribute('role', 'alert');

    const weekdaysFieldset = screen.getByRole('group', { name: 'Jours' });
    expect(weekdaysFieldset).toHaveAttribute('aria-invalid', 'true');
    expect(weekdaysFieldset).toHaveAttribute('aria-describedby', 'weekdays-error');
    expect(screen.getByText('Choisissez au moins un jour.')).toHaveAttribute('role', 'alert');
  });

  it('clears the stale distance error after a successful calculation', async () => {
    const user = userEvent.setup();
    estimateRoadDistanceKmMock
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(12.4);
    render(<PersonalDriverConfigurator plan={PERSONAL_DRIVER_PLANS.classic} />);

    await user.type(screen.getByLabelText('Adresse de depart'), 'Aeroport de Yaounde');
    await user.type(screen.getByLabelText('Destination'), 'Bastos, Yaounde');
    await user.click(screen.getByLabelText('Lundi'));
    fireEvent.change(screen.getByLabelText('Heure de depart'), { target: { value: '08:00' } });
    fireEvent.change(screen.getByLabelText('Date de debut'), { target: { value: '2099-08-03' } });
    await user.click(screen.getByRole('button', { name: 'Continuer vers l estimation' }));
    await waitFor(() => expect(screen.getByText(DISTANCE_ESTIMATE_ERROR_MESSAGE)).toBeVisible());

    await user.click(screen.getByRole('button', { name: 'Calculer la distance' }));

    await waitFor(() => expect(screen.getByText('12,4 km')).toBeVisible());
    expect(screen.queryByText(DISTANCE_ESTIMATE_ERROR_MESSAGE)).not.toBeInTheDocument();
  });

  it('automatically calculates distance when clicking continue to estimate if not calculated yet', async () => {
    const user = userEvent.setup();
    estimateRoadDistanceKmMock.mockResolvedValue(12.4);
    render(<PersonalDriverConfigurator plan={PERSONAL_DRIVER_PLANS.classic} />);

    await fillRequiredFields(user);
    // User does NOT click "Calculer la distance", but clicks "Continuer vers l estimation" directly
    await user.click(screen.getByRole('button', { name: 'Continuer vers l estimation' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/personal-driver/estimation'));
    const stored = JSON.parse(sessionStorage.getItem('medjira.personalDriver.config.v1') ?? '{}');
    expect(stored.distanceKm).toBe(12.4);
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
      startDate: '2099-08-03',
      passengerCount: 2,
      distanceKm: 12.4,
      distanceOneWayKm: 12.4,
      monthlyDistanceKm: 62,
    });
    expect(stored.requestId).toEqual(expect.any(String));
  });

  it('persists a round-trip monthly distance using the V1 estimate formula', async () => {
    const user = userEvent.setup();
    estimateRoadDistanceKmMock.mockResolvedValue(12.4);
    render(<PersonalDriverConfigurator plan={PERSONAL_DRIVER_PLANS.classic} />);

    await fillRequiredFields(user);
    await user.click(screen.getByLabelText('Aller-retour'));
    await user.type(screen.getByLabelText('Heure de retour'), '18:00');
    await user.click(screen.getByRole('button', { name: 'Calculer la distance' }));
    await waitFor(() => expect(screen.getByText('12,4 km')).toBeVisible());
    await user.click(screen.getByRole('button', { name: 'Continuer vers l estimation' }));

    const stored = JSON.parse(sessionStorage.getItem('medjira.personalDriver.config.v1') ?? '{}');
    expect(stored).toMatchObject({
      tripType: 'round_trip',
      distanceOneWayKm: 12.4,
      distanceReturnKm: 12.4,
      monthlyDistanceKm: 124,
    });
  });

  it('allows increasing and decreasing passenger count with stepper buttons', async () => {
    const user = userEvent.setup();
    render(<PersonalDriverConfigurator plan={PERSONAL_DRIVER_PLANS.classic} />);

    const input = screen.getByLabelText('Nombre de passagers') as HTMLInputElement;
    const plusBtn = screen.getByRole('button', { name: 'Augmenter le nombre de passagers' });
    const minusBtn = screen.getByRole('button', { name: 'Diminuer le nombre de passagers' });

    expect(input.value).toBe('1');
    expect(minusBtn).toBeDisabled();

    await user.click(plusBtn);
    expect(input.value).toBe('2');
    expect(minusBtn).not.toBeDisabled();

    await user.click(minusBtn);
    expect(input.value).toBe('1');
  });

  it('allows clearing the passenger count input field temporarily on mobile', async () => {
    render(<PersonalDriverConfigurator plan={PERSONAL_DRIVER_PLANS.classic} />);

    const input = screen.getByLabelText('Nombre de passagers') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');

    fireEvent.blur(input);
    expect(input.value).toBe('1');
  });

  it('disables submit button and displays loading text while calculating distance', async () => {
    let resolveDistancePromise: (val: number) => void = () => {};
    const distancePromise = new Promise<number>((resolve) => {
      resolveDistancePromise = resolve;
    });
    estimateRoadDistanceKmMock.mockReturnValue(distancePromise);

    const user = userEvent.setup();
    render(<PersonalDriverConfigurator plan={PERSONAL_DRIVER_PLANS.classic} />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Continuer vers l estimation' }));

    const submitBtn = screen.getByRole('button', { name: "Calcul de l'itinéraire..." });
    expect(submitBtn).toBeDisabled();

    resolveDistancePromise(12.4);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/personal-driver/estimation'));
  });

  it('deduplicates distance error display when calculation fails', async () => {
    const user = userEvent.setup();
    estimateRoadDistanceKmMock.mockRejectedValue(new Error('API error'));
    render(<PersonalDriverConfigurator plan={PERSONAL_DRIVER_PLANS.classic} />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Continuer vers l estimation' }));

    await waitFor(() => expect(screen.getByText(DISTANCE_ESTIMATE_ERROR_MESSAGE)).toBeInTheDocument());
    expect(screen.queryByText('Calculez une distance positive avant de continuer.')).not.toBeInTheDocument();
  });

  it('navigates even if sessionStorage.setItem throws an error', async () => {
    const user = userEvent.setup();
    estimateRoadDistanceKmMock.mockResolvedValue(12.4);
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    render(<PersonalDriverConfigurator plan={PERSONAL_DRIVER_PLANS.classic} />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Calculer la distance' }));
    await waitFor(() => expect(screen.getByText('12,4 km')).toBeVisible());

    await user.click(screen.getByRole('button', { name: 'Continuer vers l estimation' }));

    expect(mockPush).toHaveBeenCalledWith('/personal-driver/estimation');
    setItemSpy.mockRestore();
  });

  it('clears address field error when user modifies pickup or destination address', async () => {
    const user = userEvent.setup();
    render(<PersonalDriverConfigurator plan={PERSONAL_DRIVER_PLANS.classic} />);

    // Trigger validation with empty inputs
    await user.click(screen.getByRole('button', { name: 'Continuer vers l estimation' }));
    expect(screen.getByText("L'adresse de depart est requise.")).toBeInTheDocument();
    expect(screen.getByText('La destination est requise.')).toBeInTheDocument();

    // Type into pickup address
    await user.type(screen.getByLabelText('Adresse de depart'), 'Paris');
    expect(screen.queryByText("L'adresse de depart est requise.")).not.toBeInTheDocument();

    // Type into destination address
    await user.type(screen.getByLabelText('Destination'), 'Lyon');
    expect(screen.queryByText('La destination est requise.')).not.toBeInTheDocument();
  });

  it('clears distance estimate error message when user modifies address inputs', async () => {
    const user = userEvent.setup();
    estimateRoadDistanceKmMock.mockRejectedValue(new Error('Calculation failed'));
    render(<PersonalDriverConfigurator plan={PERSONAL_DRIVER_PLANS.classic} />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Calculer la distance' }));

    await waitFor(() => expect(screen.getByText(DISTANCE_ESTIMATE_ERROR_MESSAGE)).toBeInTheDocument());

    // Modifying pickup address should invalidate distance and clear the distance error message
    await user.type(screen.getByLabelText('Adresse de depart'), ' Nouveau');
    expect(screen.queryByText(DISTANCE_ESTIMATE_ERROR_MESSAGE)).not.toBeInTheDocument();
  });

  it('shows error feedback when start date is in the past or invalid', async () => {
    const user = userEvent.setup();
    estimateRoadDistanceKmMock.mockResolvedValue(12.4);

    render(<PersonalDriverConfigurator plan={PERSONAL_DRIVER_PLANS.classic} />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Calculer la distance' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continuer vers l estimation' })).not.toBeDisabled());

    const dateInput = screen.getByLabelText('Date de debut');
    fireEvent.change(dateInput, { target: { value: '2000-01-01' } });

    await user.click(screen.getByRole('button', { name: 'Continuer vers l estimation' }));

    await waitFor(() => {
      expect(screen.getByText('La date de debut ne peut pas etre dans le passe.')).toBeVisible();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('synchronizes visual input value when submitting an out-of-range passenger count', async () => {
    const user = userEvent.setup();
    estimateRoadDistanceKmMock.mockResolvedValue(12.4);

    render(<PersonalDriverConfigurator plan={PERSONAL_DRIVER_PLANS.classic} />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Calculer la distance' }));
    await waitFor(() => expect(screen.getByText('12,4 km')).toBeVisible());

    const passengerInput = screen.getByLabelText('Nombre de passagers') as HTMLInputElement;

    fireEvent.change(passengerInput, { target: { value: '12' } });
    fireEvent.blur(passengerInput);
    expect(passengerInput.value).toBe('8');

    await user.click(screen.getByRole('button', { name: 'Continuer vers l estimation' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/personal-driver/estimation'));
  });
});

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Adresse de depart'), 'Aeroport de Yaounde');
  await user.type(screen.getByLabelText('Destination'), 'Bastos, Yaounde');
  await user.click(screen.getByLabelText('Lundi'));
  fireEvent.change(screen.getByLabelText('Heure de depart'), { target: { value: '08:00' } });
  fireEvent.change(screen.getByLabelText('Date de debut'), { target: { value: '2099-08-03' } });
  fireEvent.change(screen.getByLabelText('Nombre de passagers'), { target: { value: '2' } });
}
