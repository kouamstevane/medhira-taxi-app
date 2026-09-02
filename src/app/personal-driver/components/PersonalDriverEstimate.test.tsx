import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PersonalDriverEstimate,
  PERSONAL_DRIVER_ESTIMATE_SESSION_KEY,
} from './PersonalDriverEstimate';
import { PersonalDriverPlansProvider } from '../PersonalDriverPlansProvider';
import PersonalDriverEstimationPage from '../estimation/page';
import { parsePersonalDriverConfiguration } from '../estimation/parsePersonalDriverConfiguration';
import type { PersonalDriverConfiguration } from './PersonalDriverConfigurator';
import { getPersonalDriverPlans } from '@/services/personal-driver/plan-config.service';
import { PERSONAL_DRIVER_PLANS } from '@/services/personal-driver/plans';

jest.mock('@/services/personal-driver/plan-config.service', () => ({
  getPersonalDriverPlans: jest.fn(),
}));

const configuration: PersonalDriverConfiguration = {
  version: 1,
  requestId: 'request-440',
  planId: 'basic',
  pickupAddress: 'Aeroport de Yaounde',
  destinationAddress: 'Bastos, Yaounde',
  tripType: 'round_trip',
  weekdays: [1, 2, 3, 4, 5],
  departureTime: '08:00',
  returnTime: '18:00',
  startDate: '2026-08-03',
  passengerCount: 2,
  distanceKm: 11,
  distanceOneWayKm: 11,
  distanceReturnKm: 11,
  monthlyDistanceKm: 440,
};

const livePlans = {
  ...PERSONAL_DRIVER_PLANS,
  premium: {
    ...PERSONAL_DRIVER_PLANS.premium,
    name: 'Premium Plus',
    pricePerKm: 1.05,
    minimumAmount: 800,
  },
};

describe('PersonalDriverEstimate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getPersonalDriverPlans as jest.Mock).mockResolvedValue({
      plans: livePlans,
      source: 'firestore',
      error: null,
    });
    sessionStorage.clear();
  });

  it('compares the 440 km monthly prices and recommends Classic', () => {
    render(<PersonalDriverEstimate configuration={configuration} onContinue={jest.fn()} />);

    expect(screen.getByText('Estimation indicative')).toBeVisible();
    expect(screen.getByText(/660,00/)).toBeVisible();
    expect(screen.getByText(/550,00/)).toBeVisible();
    expect(screen.getByText(/650,00/)).toBeVisible();
    expect(screen.getByText('Recommande')).toBeVisible();
    expect(screen.getByText('Classic')).toBeVisible();
  });

  it('explains when a plan minimum is applied below its distance threshold', () => {
    render(<PersonalDriverEstimate configuration={configuration} onContinue={jest.fn()} />);

    expect(screen.getByText('Le minimum de 591 km est applique pour ce forfait.')).toBeVisible();
  });

  it('lets the client choose an eligible plan that was not recommended and stores it', async () => {
    const user = userEvent.setup();
    const onContinue = jest.fn();
    render(<PersonalDriverEstimate configuration={configuration} onContinue={onContinue} />);

    await user.click(screen.getByRole('radio', { name: 'Choisir Basic' }));
    await user.click(screen.getByRole('button', { name: 'Continuer avec ce forfait' }));

    expect(onContinue).toHaveBeenCalledWith('basic');
    expect(JSON.parse(sessionStorage.getItem(PERSONAL_DRIVER_ESTIMATE_SESSION_KEY) ?? '{}')).toMatchObject({
      requestId: 'request-440',
      selectedPlanId: 'basic',
      recommendedPlanId: 'classic',
      monthlyDistanceKm: 440,
      selectedPlan: {
        totalBeforeTax: 660,
      },
    });
  });

  it('preserves the configured plan in the modifier link', () => {
    render(<PersonalDriverEstimate configuration={configuration} onContinue={jest.fn()} />);

    expect(screen.getByRole('link', { name: 'Modifier mon trajet' })).toHaveAttribute(
      'href',
      '/personal-driver/configurer?plan=basic',
    );
  });

  it('displays fractional prices with cents', () => {
    render(
      <PersonalDriverEstimate
        configuration={{ ...configuration, monthlyDistanceKm: 440.6 }}
        onContinue={jest.fn()}
      />,
    );

    expect(screen.getByText(/660,90/)).toBeVisible();
    expect(screen.getByText(/550,75/)).toBeVisible();
  });

  it('uses the loaded plan map for live estimate calculations', async () => {
    render(
      <PersonalDriverPlansProvider>
        <PersonalDriverEstimate
          configuration={{ ...configuration, planId: 'premium', monthlyDistanceKm: 440 }}
          onContinue={jest.fn()}
        />
      </PersonalDriverPlansProvider>,
    );

    expect(await screen.findByRole('radio', { name: 'Choisir Premium Plus' })).toBeVisible();
    expect(screen.getAllByText('Premium Plus').length).toBeGreaterThan(0);
    expect(screen.getByText(/800,00/)).toBeVisible();
  });

  it('uses one route heading and an inner estimate heading', () => {
    render(<PersonalDriverEstimate configuration={configuration} onContinue={jest.fn()} />);

    expect(screen.queryAllByRole('heading', { level: 1 })).toHaveLength(0);
    expect(screen.getByRole('heading', { name: 'Choisissez votre forfait', level: 2 })).toBeVisible();
  });

  it('rejects stale configurations with missing or unsafe fields', () => {
    expect(parsePersonalDriverConfiguration({ ...configuration, weekdays: [] })).toBeNull();
    expect(parsePersonalDriverConfiguration({ ...configuration, weekdays: [1, 7] })).toBeNull();
    expect(parsePersonalDriverConfiguration({ ...configuration, monthlyDistanceKm: 0 })).toBeNull();
    expect(parsePersonalDriverConfiguration({ ...configuration, tripType: 'round_trip', returnTime: '' })).toBeNull();
    expect(parsePersonalDriverConfiguration({ ...configuration, pickupAddress: 123 })).toBeNull();
    expect(parsePersonalDriverConfiguration({ ...configuration, planId: 'stale' })).toBeNull();
    expect(parsePersonalDriverConfiguration({ ...configuration, tripType: 'stale' })).toBeNull();
  });

  it('accepts a complete one-way configuration without a return time', () => {
    expect(parsePersonalDriverConfiguration({
      ...configuration,
      tripType: 'one_way',
      returnTime: undefined,
    })).toMatchObject({ tripType: 'one_way' });
  });

  it('removes an invalid stored configuration instead of rendering it', async () => {
    sessionStorage.setItem(
      'medjira.personalDriver.config.v1',
      JSON.stringify({ ...configuration, monthlyDistanceKm: Number.NaN }),
    );

    render(<PersonalDriverEstimationPage />);

    await waitFor(() => expect(sessionStorage.getItem('medjira.personalDriver.config.v1')).toBeNull());
    expect(screen.getByRole('heading', { name: 'Votre trajet est introuvable' })).toBeVisible();
  });
});
