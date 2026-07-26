import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PersonalDriverConfirmation } from './PersonalDriverConfirmation';
import { createPersonalDriverSubscriptionPayment } from '@/services/personal-driver/subscription.service';

jest.mock('@/services/personal-driver/subscription.service', () => ({
  createPersonalDriverSubscriptionPayment: jest.fn(),
}));

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const sampleConfig = {
  selectedPlanId: 'classic' as const,
  pickupAddress: '100 rue Principale, Montreal',
  destinationAddress: '500 rue Universite, Montreal',
  tripType: 'round_trip' as const,
  selectedWeekdays: [1, 2, 3, 4, 5] as (0 | 1 | 2 | 3 | 4 | 5 | 6)[],
  departureTime: '07:30',
  returnTime: '17:00',
  startDate: '2026-08-01',
  passengerCount: 1,
  notes: 'Pres du hall d\'entree',
  distanceOneWayKm: 10,
  distanceReturnKm: 10,
  monthlyDistanceKm: 440,
};

const sampleEstimate = {
  monthlyDistanceKm: 440,
  plans: {
    basic: {
      planId: 'basic' as const,
      isEligible: true,
      pricePerKm: 1.5,
      minimumAmount: 300,
      minimumBillableKm: 200,
      distanceAmount: 660,
      totalBeforeTax: 660,
      minimumApplied: false,
      savingsComparedToBasic: 0,
    },
    classic: {
      planId: 'classic' as const,
      isEligible: true,
      pricePerKm: 1.25,
      minimumAmount: 450,
      minimumBillableKm: 360,
      distanceAmount: 550,
      totalBeforeTax: 550,
      minimumApplied: false,
      savingsComparedToBasic: 110,
    },
    premium: {
      planId: 'premium' as const,
      isEligible: true,
      pricePerKm: 1.1,
      minimumAmount: 650,
      minimumBillableKm: 591,
      distanceAmount: 484,
      totalBeforeTax: 650,
      minimumApplied: true,
      savingsComparedToBasic: 10,
    },
  },
  recommendedPlanId: 'classic' as const,
  recommendationReasons: ['Classic vous fait economiser 110,00 $'],
};

describe('PersonalDriverConfirmation Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    sessionStorage.setItem('medjira.personalDriver.config.v1', JSON.stringify(sampleConfig));
    sessionStorage.setItem('medjira.personalDriver.estimate.v1', JSON.stringify(sampleEstimate));
  });

  it('renders summary information correctly', () => {
    render(<PersonalDriverConfirmation />);

    expect(screen.getByText(/CLASSIC/i)).toBeInTheDocument();
    expect(screen.getByText(/100 rue Principale/i)).toBeInTheDocument();
    expect(screen.getByText(/500 rue Universite/i)).toBeInTheDocument();
    expect(screen.getByText(/Aller-retour/i)).toBeInTheDocument();
    expect(screen.getByText(/440 km/i)).toBeInTheDocument();
    expect(screen.getByText(/550(\.|,)00 \$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirmer et payer/i })).toBeInTheDocument();
  });

  it('submits payment when Confirmer et payer is clicked', async () => {
    (createPersonalDriverSubscriptionPayment as jest.Mock).mockResolvedValue({
      subscriptionId: 'sub_123',
      paymentIntentId: 'pi_123',
      clientSecret: 'secret_123',
      amount: 550,
      currency: 'cad',
    });

    render(<PersonalDriverConfirmation />);

    const submitBtn = screen.getByRole('button', { name: /Confirmer et payer/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createPersonalDriverSubscriptionPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedPlanId: 'classic',
          pickupAddress: '100 rue Principale, Montreal',
          monthlyDistanceKm: 440,
        })
      );
    });
  });
});
