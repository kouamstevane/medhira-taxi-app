import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PersonalDriverClientDashboard } from './PersonalDriverClientDashboard';
import {
  getCurrentPersonalDriverSubscription,
  getPersonalDriverTripsForSubscription,
  renewPersonalDriverSubscriptionPayment,
} from '@/services/personal-driver/subscription.service';

jest.mock('@/services/personal-driver/subscription.service', () => ({
  getCurrentPersonalDriverSubscription: jest.fn(),
  getPersonalDriverTripsForSubscription: jest.fn(),
  renewPersonalDriverSubscriptionPayment: jest.fn(),
}));

jest.mock('next/dynamic', () => () => {
  return function MockStripePaymentElement(props: { submitLabel?: string }) {
    return <button type="button">{props.submitLabel}</button>;
  };
});

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ currentUser: { uid: 'user_123' } }),
}));

describe('PersonalDriverClientDashboard Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders no subscription message when user has no active subscription', async () => {
    (getCurrentPersonalDriverSubscription as jest.Mock).mockResolvedValue(null);

    render(<PersonalDriverClientDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Aucun abonnement Personal Driver actif/i)).toBeInTheDocument();
    });
  });

  it('renders pending payment subscription details', async () => {
    (getCurrentPersonalDriverSubscription as jest.Mock).mockResolvedValue({
      id: 'sub_123',
      userId: 'user_123',
      selectedPlanId: 'classic',
      status: 'pending_payment',
      monthlyDistanceKm: 440,
      startDate: '2026-08-01',
      pickupAddress: '100 rue Principale',
      destinationAddress: '500 rue Universite',
    });

    (getPersonalDriverTripsForSubscription as jest.Mock).mockResolvedValue([
      {
        id: 'trip_1',
        scheduledAtIso: '2026-08-01T07:30:00',
        direction: 'outbound',
        pickupAddress: '100 rue Principale',
        destinationAddress: '500 rue Universite',
        status: 'scheduled',
      },
    ]);

    render(<PersonalDriverClientDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/MON ACCÈS PERSONAL DRIVER/i)).toBeInTheDocument();
      expect(screen.getByText(/Paiement en attente/i)).toBeInTheDocument();
      expect(screen.getByText(/440 km/i)).toBeInTheDocument();
      expect(screen.getAllByText(/100 rue Principale/i).length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: /Demander un trajet spécial/i })).toBeDisabled();
    });
  });

  it('enables special trips only for an active paid package and shows exact persisted dates', async () => {
    (getCurrentPersonalDriverSubscription as jest.Mock).mockResolvedValue({
      id: 'sub_active',
      userId: 'user_123',
      selectedPlanId: 'classic',
      status: 'active',
      paymentStatus: 'succeeded',
      monthlyDistanceKm: 440,
      periodStartDate: '2026-08-01',
      periodEndDateExclusive: '2026-08-31',
      periodStartAtUtc: '2026-08-01T04:00:00.000Z',
      periodEndAtUtc: '2026-08-31T04:00:00.000Z',
      pickupAddress: '100 rue Principale',
      destinationAddress: '500 rue Universite',
    });
    (getPersonalDriverTripsForSubscription as jest.Mock).mockResolvedValue([]);

    render(<PersonalDriverClientDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Période : 2026-08-01 → 2026-08-31/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Demander un trajet spécial/i })).toBeEnabled();
    });
  });

  it('formats the authoritative renewal quote with the shared currency formatter', async () => {
    (getCurrentPersonalDriverSubscription as jest.Mock).mockResolvedValue({
      id: 'sub_active',
      userId: 'user_123',
      selectedPlanId: 'classic',
      status: 'active',
      paymentStatus: 'succeeded',
      monthlyDistanceKm: 440,
      periodStartDate: '2026-08-01',
      periodEndDateExclusive: '2026-08-31',
      periodStartAtUtc: '2026-08-01T04:00:00.000Z',
      periodEndAtUtc: '2026-08-31T04:00:00.000Z',
      pickupAddress: '100 rue Principale',
      destinationAddress: '500 rue Universite',
    });
    (getPersonalDriverTripsForSubscription as jest.Mock).mockResolvedValue([]);
    (renewPersonalDriverSubscriptionPayment as jest.Mock).mockResolvedValue({
      subscriptionId: 'sub_renewed',
      paymentIntentId: 'pi_renewed',
      clientSecret: 'secret_renewed',
      amount: 451.25,
      currency: 'usd',
      quote: {
        distanceOneWayKm: 10,
        distanceReturnKm: 13.4,
        monthlyDistanceKm: 514.8,
        selectedPlanPrice: {
          planId: 'classic',
          isEligible: true,
          pricePerKm: 1.25,
          minimumAmount: 450,
          minimumBillableKm: 360,
          distanceAmount: 643.5,
          totalBeforeTax: 451.25,
          minimumApplied: false,
          savingsComparedToBasic: 0,
        },
        taxAmount: 0,
        totalAmount: 451.25,
        currency: 'usd',
      },
    });

    render(<PersonalDriverClientDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Renouveler' }));

    expect(await screen.findByRole('button', { name: /Payer 451,25.*US/ })).toBeVisible();
  });
});
