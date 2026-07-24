import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PersonalDriverEstimate,
  PERSONAL_DRIVER_ESTIMATE_SESSION_KEY,
} from './PersonalDriverEstimate';
import type { PersonalDriverConfiguration } from './PersonalDriverConfigurator';

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

describe('PersonalDriverEstimate', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('compares the 440 km monthly prices and recommends Classic', () => {
    render(<PersonalDriverEstimate configuration={configuration} onContinue={jest.fn()} />);

    expect(screen.getByText('660 CAD')).toBeVisible();
    expect(screen.getByText('550 CAD')).toBeVisible();
    expect(screen.getByText('650 CAD')).toBeVisible();
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
});
