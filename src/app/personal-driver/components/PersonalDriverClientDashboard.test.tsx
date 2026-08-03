import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { PersonalDriverClientDashboard } from './PersonalDriverClientDashboard';
import {
  getCurrentPersonalDriverSubscription,
  getPersonalDriverTripsForSubscription,
} from '@/services/personal-driver/subscription.service';

jest.mock('@/services/personal-driver/subscription.service', () => ({
  getCurrentPersonalDriverSubscription: jest.fn(),
  getPersonalDriverTripsForSubscription: jest.fn(),
}));

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
    });
  });
});
