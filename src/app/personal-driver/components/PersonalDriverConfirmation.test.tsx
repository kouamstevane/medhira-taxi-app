import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PersonalDriverConfirmation } from './PersonalDriverConfirmation';
import { createPersonalDriverSubscriptionPayment } from '@/services/personal-driver/subscription.service';

jest.mock('@/services/personal-driver/subscription.service', () => ({
  createPersonalDriverSubscriptionPayment: jest.fn(),
}));

jest.mock('next/dynamic', () => () => {
  return function MockStripePaymentElement(props: {
    clientSecret: string;
    amount: number;
    currency: string;
    submitLabel?: string;
    onSuccess: (paymentIntentId: string) => void;
  }) {
    return (
      <div>
        <p>Stripe Elements prêt: {props.clientSecret}</p>
        <p>{props.amount} {props.currency}</p>
        <button type="button" onClick={() => props.onSuccess('pi_123')}>{props.submitLabel}</button>
      </div>
    );
  };
});

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const sampleConfig = {
  version: 1,
  requestId: 'request-123',
  planId: 'basic' as const,
  pickupAddress: '100 rue Principale, Montreal',
  destinationAddress: '500 rue Universite, Montreal',
  tripType: 'round_trip' as const,
  weekdays: [1, 2, 3, 4, 5] as (0 | 1 | 2 | 3 | 4 | 5 | 6)[],
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
  version: 1,
  requestId: 'request-123',
  selectedPlanId: 'premium' as const,
  monthlyDistanceKm: 440,
  selectedPlan: {
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
  comparison: {
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
  },
  recommendedPlanId: 'classic' as const,
  configuration: sampleConfig,
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

    expect(screen.getByText(/PREMIUM/i)).toBeInTheDocument();
    expect(screen.getByText(/100 rue Principale/i)).toBeInTheDocument();
    expect(screen.getByText(/500 rue Universite/i)).toBeInTheDocument();
    expect(screen.getByText(/Aller-retour/i)).toBeInTheDocument();
    expect(screen.getAllByText(/440 km/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/650(\.|,)00 \$/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Préparer le paiement sécurisé/i })).toBeInTheDocument();
  });

  it('creates a PaymentIntent with the selected estimate plan and then renders Stripe Elements', async () => {
    (createPersonalDriverSubscriptionPayment as jest.Mock).mockResolvedValue({
      subscriptionId: 'sub_123',
      paymentIntentId: 'pi_123',
      clientSecret: 'secret_123',
      amount: 650,
      currency: 'cad',
    });

    render(<PersonalDriverConfirmation />);

    const submitBtn = screen.getByRole('button', { name: /Préparer le paiement sécurisé/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createPersonalDriverSubscriptionPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedPlanId: 'premium',
          requestId: 'request-123',
          pickupAddress: '100 rue Principale, Montreal',
          selectedWeekdays: [1, 2, 3, 4, 5],
          monthlyDistanceKm: 440,
        })
      );
    });
    expect(await screen.findByText('Stripe Elements prêt: secret_123')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Payer 650,00/i })).toBeInTheDocument();
  });

  it('redirects to dashboard only after Stripe confirms the payment', async () => {
    (createPersonalDriverSubscriptionPayment as jest.Mock).mockResolvedValue({
      subscriptionId: 'sub_123',
      paymentIntentId: 'pi_123',
      clientSecret: 'secret_123',
      amount: 650,
      currency: 'cad',
    });

    render(<PersonalDriverConfirmation />);

    fireEvent.click(screen.getByRole('button', { name: /Préparer le paiement sécurisé/i }));
    expect(mockPush).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: /Payer 650,00/i }));

    expect(mockPush).toHaveBeenCalledWith('/personal-driver/dashboard?payment=success&subscriptionId=sub_123');
  });
});
