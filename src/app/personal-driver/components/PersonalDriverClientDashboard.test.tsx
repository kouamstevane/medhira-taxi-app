import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PersonalDriverClientDashboard } from './PersonalDriverClientDashboard';
import {
  getCurrentPersonalDriverSubscription,
  getPendingPersonalDriverRenewal,
  getPersonalDriverSubscriptionView,
  getPersonalDriverSubscriptionById,
  getPersonalDriverTripsForSubscription,
  requestSpecialTrip,
  renewPersonalDriverSubscriptionPayment,
} from '@/services/personal-driver/subscription.service';

jest.mock('@/services/personal-driver/subscription.service', () => ({
  getCurrentPersonalDriverSubscription: jest.fn(),
  getPendingPersonalDriverRenewal: jest.fn(),
  getPersonalDriverSubscriptionView: jest.fn(),
  getPersonalDriverSubscriptionById: jest.fn(),
  getPersonalDriverTripsForSubscription: jest.fn(),
  cancelPersonalDriverTripByClient: jest.fn(),
  requestSpecialTrip: jest.fn(),
  renewPersonalDriverSubscriptionPayment: jest.fn(),
}));

jest.mock('next/dynamic', () => () => {
  return function MockStripePaymentElement(props: { submitLabel?: string; onSuccess: (paymentIntentId: string) => void }) {
    return <button type="button" onClick={() => props.onSuccess('pi_renewed')}>{props.submitLabel}</button>;
  };
});

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ currentUser: { uid: 'user_123' } }),
}));

describe('PersonalDriverClientDashboard Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getPendingPersonalDriverRenewal as jest.Mock).mockResolvedValue(null);
    (getPersonalDriverSubscriptionView as jest.Mock).mockImplementation(async () => {
      const [current, pending] = await Promise.all([
        (getCurrentPersonalDriverSubscription as jest.Mock)(),
        (getPendingPersonalDriverRenewal as jest.Mock)(),
      ]);
      return {
        active: current?.status === 'active' ? current : null,
        pending: pending ?? (current?.status === 'active' ? null : current),
      };
    });
  });

  afterEach(() => {
    jest.useRealTimers();
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

  it('shows a French alert and retries a failed subscription reload', async () => {
    (getPersonalDriverSubscriptionView as jest.Mock)
      .mockRejectedValueOnce({ code: 'functions/unavailable' })
      .mockResolvedValueOnce({ active: null, pending: null });

    render(<PersonalDriverClientDashboard />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/service est momentanément indisponible/i);
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText(/Aucun abonnement Personal Driver actif/i)).toBeInTheDocument();
  });

  it('keeps payment failure visible when activation has not started', async () => {
    (getCurrentPersonalDriverSubscription as jest.Mock).mockResolvedValue({
      id: 'sub_payment_failed',
      userId: 'user_123',
      selectedPlanId: 'classic',
      status: 'payment_failed',
      paymentStatus: 'failed',
      activationStatus: 'pending_payment',
      monthlyDistanceKm: 440,
      pickupAddress: '100 rue Principale',
      destinationAddress: '500 rue Universite',
    });
    (getPersonalDriverTripsForSubscription as jest.Mock).mockResolvedValue([]);

    render(<PersonalDriverClientDashboard />);

    expect((await screen.findAllByText('Paiement échoué')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Paiement en attente')).not.toBeInTheDocument();
  });

  it('renders paid activation in progress instead of an empty calendar message', async () => {
    (getCurrentPersonalDriverSubscription as jest.Mock).mockResolvedValue({
      id: 'sub_activating',
      userId: 'user_123',
      selectedPlanId: 'classic',
      status: 'pending_payment',
      paymentStatus: 'succeeded',
      activationStatus: 'activating',
      monthlyDistanceKm: 440,
      pickupAddress: '100 rue Principale',
      destinationAddress: '500 rue Universite',
    });
    (getPersonalDriverTripsForSubscription as jest.Mock).mockResolvedValue([]);

    render(<PersonalDriverClientDashboard />);

    expect(await screen.findByText('Paiement confirmé — préparation de vos trajets…')).toBeVisible();
    expect(screen.queryByText(/Votre calendrier est en préparation/i)).not.toBeInTheDocument();
    expect(getPersonalDriverSubscriptionView).toHaveBeenCalledWith('user_123');
    expect(getPersonalDriverTripsForSubscription).not.toHaveBeenCalled();
  });

  it('renders activation failure and refresh guidance instead of an empty calendar message', async () => {
    (getCurrentPersonalDriverSubscription as jest.Mock).mockResolvedValue({
      id: 'sub_failed',
      userId: 'user_123',
      selectedPlanId: 'classic',
      status: 'pending_payment',
      paymentStatus: 'succeeded',
      activationStatus: 'activation_failed',
      activationError: 'trip generation failed',
      monthlyDistanceKm: 440,
      pickupAddress: '100 rue Principale',
      destinationAddress: '500 rue Universite',
    });
    (getPersonalDriverTripsForSubscription as jest.Mock).mockResolvedValue([]);

    render(<PersonalDriverClientDashboard />);

    expect(await screen.findByText(/La préparation de vos trajets a échoué/i)).toBeVisible();
    expect(screen.getByText(/Actualisez cette page/i)).toBeVisible();
    expect(screen.queryByText(/Votre calendrier est en préparation/i)).not.toBeInTheDocument();
  });

  it('displays a paid failed renewal over the older active source without reopening checkout', async () => {
    (getCurrentPersonalDriverSubscription as jest.Mock).mockResolvedValue({
      id: 'sub_active',
      userId: 'user_123',
      selectedPlanId: 'classic',
      status: 'active',
      paymentStatus: 'succeeded',
      activationStatus: 'active',
      monthlyDistanceKm: 440,
      pickupAddress: 'Ancien départ',
      destinationAddress: 'Ancienne destination',
    });
    (getPendingPersonalDriverRenewal as jest.Mock).mockResolvedValue({
      id: 'sub_renewal',
      userId: 'user_123',
      sourceSubscriptionId: 'sub_active',
      selectedPlanId: 'premium',
      status: 'pending_payment',
      paymentStatus: 'succeeded',
      activationStatus: 'activation_failed',
      activationError: 'trip generation failed',
      monthlyDistanceKm: 600,
      pickupAddress: 'Nouveau départ',
      destinationAddress: 'Nouvelle destination',
    });
    (getPersonalDriverTripsForSubscription as jest.Mock).mockResolvedValue([]);

    render(<PersonalDriverClientDashboard />);

    expect(await screen.findByText(/La préparation de vos trajets a échoué/i)).toBeVisible();
    expect(screen.getByText('Nouveau départ')).toBeVisible();
    expect(screen.queryByText('Ancien départ')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Réessayer la vérification/i })).toBeVisible();
    expect(renewPersonalDriverSubscriptionPayment).not.toHaveBeenCalled();
    expect(getPersonalDriverTripsForSubscription).toHaveBeenCalledWith('sub_active');
    expect(getPersonalDriverTripsForSubscription).not.toHaveBeenCalledWith('sub_renewal');
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

  it('shows authoritative special-trip quotas and clears them before a later request', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-04T12:00:00.000Z'));
    (getCurrentPersonalDriverSubscription as jest.Mock).mockResolvedValue({
      id: 'sub_active',
      userId: 'user_123',
      selectedPlanId: 'classic',
      status: 'active',
      paymentStatus: 'succeeded',
      monthlyDistanceKm: 50,
      monthlyDistanceKmRemaining: 50,
      specialTripsUsed: 0,
      periodStartDate: '2026-08-01',
      periodEndDateExclusive: '2026-09-01',
      periodStartAtUtc: '2026-08-01T00:00:00.000Z',
      periodEndAtUtc: '2026-09-01T00:00:00.000Z',
      pickupAddress: '100 rue Principale',
      destinationAddress: '500 rue Universite',
    });
    (getPersonalDriverTripsForSubscription as jest.Mock).mockResolvedValue([]);
    (requestSpecialTrip as jest.Mock).mockResolvedValue({
      success: true,
      tripId: 'special_1',
      officialDistanceKm: 8.2,
      specialTripsRemaining: 1,
      monthlyDistanceKmRemaining: 41.8,
    });

    render(<PersonalDriverClientDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /Demander un trajet spécial/i }));
    expect(screen.getByText(/déduit du kilométrage restant affiché/i)).toBeVisible();
    fireEvent.change(screen.getByLabelText('Lieu de prise en charge'), { target: { value: 'Clinique' } });
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'Aéroport' } });
    fireEvent.change(screen.getByLabelText('Date du trajet'), { target: { value: '2026-08-12' } });
    fireEvent.change(screen.getByLabelText('Heure du trajet'), { target: { value: '09:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer le trajet spécial' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Distance officielle : 8,2 km. Trajets spéciaux restants : 1. Kilométrage restant : 41,8 km.',
    );

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (requestSpecialTrip as jest.Mock).mockRejectedValueOnce(new Error('Route indisponible'));
    fireEvent.click(screen.getByRole('button', { name: /Demander un trajet spécial/i }));
    fireEvent.change(screen.getByLabelText('Lieu de prise en charge'), { target: { value: 'Clinique' } });
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'Aéroport' } });
    fireEvent.change(screen.getByLabelText('Date du trajet'), { target: { value: '2026-08-13' } });
    fireEvent.change(screen.getByLabelText('Heure du trajet'), { target: { value: '10:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer le trajet spécial' }));

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    consoleErrorSpy.mockRestore();
  });

  it('polls the known paid renewal every two seconds after confirmation and exposes failure guidance', async () => {
    (getCurrentPersonalDriverSubscription as jest.Mock).mockResolvedValue({
      id: 'sub_active',
      userId: 'user_123',
      selectedPlanId: 'classic',
      status: 'active',
      paymentStatus: 'succeeded',
      activationStatus: 'active',
      monthlyDistanceKm: 440,
      pickupAddress: 'Ancien départ',
      destinationAddress: 'Ancienne destination',
    });
    (getPersonalDriverTripsForSubscription as jest.Mock).mockResolvedValue([]);
    (renewPersonalDriverSubscriptionPayment as jest.Mock).mockResolvedValue({
      subscriptionId: 'sub_renewed',
      paymentIntentId: 'pi_renewed',
      clientSecret: 'secret_renewed',
      amount: 451.25,
      currency: 'cad',
      quote: {
        totalAmount: 451.25,
        currency: 'cad',
      },
    });
    (getPersonalDriverSubscriptionById as jest.Mock)
      .mockResolvedValueOnce({
        id: 'sub_renewed',
        userId: 'user_123',
        sourceSubscriptionId: 'sub_active',
        selectedPlanId: 'classic',
        status: 'pending_payment',
        paymentStatus: 'succeeded',
        activationStatus: 'activating',
        monthlyDistanceKm: 440,
        pickupAddress: 'Nouveau départ',
        destinationAddress: 'Nouvelle destination',
      })
      .mockResolvedValueOnce({
        id: 'sub_renewed',
        userId: 'user_123',
        sourceSubscriptionId: 'sub_active',
        selectedPlanId: 'classic',
        status: 'pending_payment',
        paymentStatus: 'succeeded',
        activationStatus: 'activation_failed',
        activationError: 'trip generation failed',
        monthlyDistanceKm: 440,
        pickupAddress: 'Nouveau départ',
        destinationAddress: 'Nouvelle destination',
      });

    render(<PersonalDriverClientDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Renouveler' }));
    jest.useFakeTimers();
    fireEvent.click(await screen.findByRole('button', { name: /Payer 451,25/i }));

    expect(screen.getByText('Paiement confirmé — préparation de vos trajets…')).toBeVisible();
    expect(getPersonalDriverSubscriptionById).not.toHaveBeenCalled();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2_000);
    });
    expect(getPersonalDriverSubscriptionById).toHaveBeenCalledWith('sub_renewed');
    expect(getPersonalDriverSubscriptionById).toHaveBeenCalledTimes(1);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(2_000);
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/préparation de vos trajets a échoué/i);
    expect(screen.getByRole('button', { name: /Réessayer la vérification/i })).toBeVisible();
    expect(renewPersonalDriverSubscriptionPayment).toHaveBeenCalledTimes(1);
  });

  it('reloads the current subscription view before fetching trips after renewal activation', async () => {
    (getCurrentPersonalDriverSubscription as jest.Mock).mockResolvedValue({
      id: 'sub_active',
      userId: 'user_123',
      selectedPlanId: 'classic',
      status: 'active',
      paymentStatus: 'succeeded',
      monthlyDistanceKm: 440,
      pickupAddress: 'Ancien départ',
      destinationAddress: 'Ancienne destination',
    });
    (getPersonalDriverTripsForSubscription as jest.Mock).mockResolvedValue([]);
    (renewPersonalDriverSubscriptionPayment as jest.Mock).mockResolvedValue({
      subscriptionId: 'sub_renewed',
      paymentIntentId: 'pi_renewed',
      clientSecret: 'secret_renewed',
      amount: 451.25,
      currency: 'cad',
      quote: { totalAmount: 451.25, currency: 'cad' },
    });
    (getPersonalDriverSubscriptionById as jest.Mock).mockResolvedValue({
      id: 'sub_renewed',
      userId: 'user_123',
      sourceSubscriptionId: 'sub_active',
      selectedPlanId: 'classic',
      status: 'active',
      paymentStatus: 'succeeded',
      activationStatus: 'active',
      periodStartAtUtc: '2026-09-01T00:00:00.000Z',
      periodEndAtUtc: '2026-10-01T00:00:00.000Z',
      monthlyDistanceKm: 440,
      pickupAddress: 'Nouveau départ',
      destinationAddress: 'Nouvelle destination',
    });

    render(<PersonalDriverClientDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Renouveler' }));
    jest.useFakeTimers();
    fireEvent.click(await screen.findByRole('button', { name: /Payer 451,25/i }));

    await act(async () => {
      await jest.advanceTimersByTimeAsync(2_000);
    });

    expect(getPersonalDriverSubscriptionById).toHaveBeenCalledWith('sub_renewed');
    expect(getPersonalDriverSubscriptionView).toHaveBeenCalledTimes(2);
    expect(getPersonalDriverTripsForSubscription).toHaveBeenCalledWith('sub_active');
    expect(getPersonalDriverTripsForSubscription).not.toHaveBeenCalledWith('sub_renewed');
  });

  it('recovers a pending renewal payment after reload and disables another checkout', async () => {
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
    (getPendingPersonalDriverRenewal as jest.Mock).mockResolvedValue({
      id: 'sub_pending',
      userId: 'user_123',
      sourceSubscriptionId: 'sub_active',
      status: 'pending_payment',
      paymentStatus: 'pending',
    });
    (getPersonalDriverTripsForSubscription as jest.Mock).mockResolvedValue([]);
    (renewPersonalDriverSubscriptionPayment as jest.Mock).mockResolvedValue({
      subscriptionId: 'sub_pending',
      paymentIntentId: 'pi_pending',
      clientSecret: 'secret_pending',
      amount: 450,
      currency: 'cad',
      quote: {
        totalAmount: 450,
        currency: 'cad',
      },
    });

    render(<PersonalDriverClientDashboard />);

    expect(await screen.findByRole('button', { name: /Payer 450,00/ })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Renouveler' })).toBeDisabled();
    expect(renewPersonalDriverSubscriptionPayment).toHaveBeenCalledWith(
      'sub_active',
      'recover-sub_pending',
      'sub_pending',
    );
  });
});
