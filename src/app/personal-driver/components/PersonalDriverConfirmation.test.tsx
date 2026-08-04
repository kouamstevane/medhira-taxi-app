import React from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PersonalDriverConfirmation } from './PersonalDriverConfirmation';
import {
  createPersonalDriverSubscriptionPayment,
  getPersonalDriverSubscriptionById,
} from '@/services/personal-driver/subscription.service';

jest.mock('@/services/personal-driver/subscription.service', () => ({
  createPersonalDriverSubscriptionPayment: jest.fn(),
  getPersonalDriverSubscriptionById: jest.fn(),
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
const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
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

const authoritativePayment = {
  subscriptionId: 'sub_123',
  paymentIntentId: 'pi_123',
  clientSecret: 'secret_123',
  amount: 723.45,
  currency: 'cad',
  quote: {
    distanceOneWayKm: 10,
    distanceReturnKm: 13.4,
    monthlyDistanceKm: 514.8,
    selectedPlanPrice: {
      ...sampleEstimate.selectedPlan,
      distanceAmount: 566.28,
      totalBeforeTax: 723.45,
      minimumApplied: false,
    },
    taxAmount: 0 as const,
    totalAmount: 723.45,
    currency: 'cad',
  },
};

describe('PersonalDriverConfirmation Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    sessionStorage.clear();
    sessionStorage.setItem('medjira.personalDriver.config.v1', JSON.stringify(sampleConfig));
    sessionStorage.setItem('medjira.personalDriver.estimate.v1', JSON.stringify(sampleEstimate));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders summary information correctly', () => {
    render(<PersonalDriverConfirmation />);

    expect(screen.getByText(/PREMIUM/i)).toBeInTheDocument();
    expect(screen.getByText(/100 rue Principale/i)).toBeInTheDocument();
    expect(screen.getByText(/500 rue Universite/i)).toBeInTheDocument();
    expect(screen.getByText(/Aller-retour/i)).toBeInTheDocument();
    expect(screen.getAllByText(/440 km/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/650(\.|,)00 \$/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Estimation indicative')).toBeVisible();
    expect(screen.getByRole('button', { name: /Préparer le paiement sécurisé/i })).toBeInTheDocument();
  });

  it('replaces the browser estimate with the exact callable quote before rendering Stripe Elements', async () => {
    (createPersonalDriverSubscriptionPayment as jest.Mock).mockResolvedValue(authoritativePayment);

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
    expect(screen.getByText('23,4 km')).toBeVisible();
    expect(screen.getAllByText(/723,45/).length).toBeGreaterThan(0);
    expect(screen.getByText('CAD')).toBeVisible();
    expect(screen.getByText('Taxes non calculées')).toBeVisible();
    expect(screen.queryByText('Estimation indicative')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Payer 723,45/i })).toBeInTheDocument();
  });

  it('polls every two seconds and redirects only after server activation', async () => {
    (createPersonalDriverSubscriptionPayment as jest.Mock).mockResolvedValue(authoritativePayment);
    (getPersonalDriverSubscriptionById as jest.Mock)
      .mockResolvedValueOnce({ id: 'sub_123', activationStatus: 'activating' })
      .mockResolvedValueOnce({ id: 'sub_123', activationStatus: 'active' });

    render(<PersonalDriverConfirmation />);

    fireEvent.click(screen.getByRole('button', { name: /Préparer le paiement sécurisé/i }));
    expect(mockPush).not.toHaveBeenCalled();
    jest.useFakeTimers();
    fireEvent.click(await screen.findByRole('button', { name: /Payer 723,45/i }));

    expect(screen.getByText('Paiement confirmé — préparation de vos trajets…')).toBeVisible();
    expect(mockReplace).toHaveBeenCalledWith(
      '/personal-driver/confirmation?payment=submitted&subscriptionId=sub_123',
      { scroll: false },
    );
    expect(getPersonalDriverSubscriptionById).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(2_000);
    });
    expect(getPersonalDriverSubscriptionById).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(2_000);
    });

    expect(mockPush).toHaveBeenCalledWith('/personal-driver/dashboard?payment=success&subscriptionId=sub_123');
  });

  it('shows retry guidance when server activation fails', async () => {
    (createPersonalDriverSubscriptionPayment as jest.Mock).mockResolvedValue(authoritativePayment);
    (getPersonalDriverSubscriptionById as jest.Mock).mockResolvedValue({
      id: 'sub_123',
      activationStatus: 'activation_failed',
      activationError: 'trip generation failed',
    });

    render(<PersonalDriverConfirmation />);
    fireEvent.click(screen.getByRole('button', { name: /Préparer le paiement sécurisé/i }));
    jest.useFakeTimers();
    fireEvent.click(await screen.findByRole('button', { name: /Payer 723,45/i }));

    await act(async () => {
      await jest.advanceTimersByTimeAsync(2_000);
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/préparation de vos trajets a échoué/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/actualisez/i);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows refresh guidance when activation still has not completed after sixty seconds', async () => {
    (createPersonalDriverSubscriptionPayment as jest.Mock).mockResolvedValue(authoritativePayment);
    (getPersonalDriverSubscriptionById as jest.Mock).mockResolvedValue({
      id: 'sub_123',
      activationStatus: 'activating',
    });

    render(<PersonalDriverConfirmation />);
    fireEvent.click(screen.getByRole('button', { name: /Préparer le paiement sécurisé/i }));
    jest.useFakeTimers();
    fireEvent.click(await screen.findByRole('button', { name: /Payer 723,45/i }));

    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/plus de temps que prévu/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/actualisez/i);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('resumes a submitted subscription from the URL after refresh and retries verification after timeout', async () => {
    mockSearchParams = new URLSearchParams('payment=submitted&subscriptionId=sub_123');
    (getPersonalDriverSubscriptionById as jest.Mock).mockResolvedValue({
      id: 'sub_123',
      activationStatus: 'activating',
    });
    jest.useFakeTimers();

    render(<PersonalDriverConfirmation />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('Paiement confirmé — préparation de vos trajets…')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Préparer le paiement sécurisé/i })).not.toBeInTheDocument();
    expect(createPersonalDriverSubscriptionPayment).not.toHaveBeenCalled();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/plus de temps que prévu/i);
    const retryButton = screen.getByRole('button', { name: /Réessayer la vérification/i });
    (getPersonalDriverSubscriptionById as jest.Mock).mockResolvedValue({
      id: 'sub_123',
      activationStatus: 'active',
    });
    fireEvent.click(retryButton);

    expect(screen.getByText('Paiement confirmé — préparation de vos trajets…')).toBeVisible();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2_000);
    });

    expect(mockPush).toHaveBeenCalledWith('/personal-driver/dashboard?payment=success&subscriptionId=sub_123');
    expect(createPersonalDriverSubscriptionPayment).not.toHaveBeenCalled();
  });

  it('resumes the submitted subscription from the URL when checkout session data is unavailable', async () => {
    mockSearchParams = new URLSearchParams('payment=submitted&subscriptionId=sub_123');
    sessionStorage.clear();
    (getPersonalDriverSubscriptionById as jest.Mock).mockResolvedValue({
      id: 'sub_123',
      activationStatus: 'active',
    });
    jest.useFakeTimers();

    render(<PersonalDriverConfirmation />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('Paiement confirmé — préparation de vos trajets…')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Préparer le paiement sécurisé/i })).not.toBeInTheDocument();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(2_000);
    });

    expect(mockPush).toHaveBeenCalledWith('/personal-driver/dashboard?payment=success&subscriptionId=sub_123');
    expect(createPersonalDriverSubscriptionPayment).not.toHaveBeenCalled();
  });
});
