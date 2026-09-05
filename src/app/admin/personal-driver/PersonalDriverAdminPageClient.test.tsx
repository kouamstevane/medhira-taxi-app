import { fireEvent, render, screen } from '@testing-library/react';
import { getPersonalDriverPlans } from '@/services/personal-driver/plan-config.service';
import { PERSONAL_DRIVER_PLANS } from '@/services/personal-driver/plans';

const mockGetDocs = jest.fn();

jest.mock('@/services/personal-driver/plan-config.service', () => ({
  getPersonalDriverPlans: jest.fn(),
}));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  getDocs: mockGetDocs,
  limit: jest.fn(() => ({})),
  orderBy: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  where: jest.fn(() => ({})),
}));
const mockCallable = jest.fn();
jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn(() => mockCallable),
}));
jest.mock('@/config/firebase', () => ({ db: {}, functions: {} }));
jest.mock('@/components/ui/MaterialIcon', () => ({ MaterialIcon: () => <span /> }));

describe('PersonalDriverAdminPageClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCallable.mockResolvedValue({ data: { success: true } });
    (getPersonalDriverPlans as jest.Mock).mockResolvedValue({
      plans: PERSONAL_DRIVER_PLANS,
      source: 'firestore',
      error: null,
    });
  });

  it('shows a French alert and retries an operational refresh failure', async () => {
    mockGetDocs
      .mockRejectedValueOnce({ code: 'functions/unavailable' })
      .mockResolvedValue({ docs: [] });
    const { PersonalDriverAdminPageClient } = require('./PersonalDriverAdminPageClient');

    render(<PersonalDriverAdminPageClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/service est momentanément indisponible/i);
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Trajets' }));
    expect(await screen.findByText('Aucun trajet récent à afficher.')).toBeInTheDocument();
  });

  it('mounts the plan editor below the admin heading without removing operational actions', async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });
    const { PersonalDriverAdminPageClient } = require('./PersonalDriverAdminPageClient');

    render(<PersonalDriverAdminPageClient />);

    expect(screen.getByRole('heading', { name: /Administration — Personal Driver Medjira/i })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Forfaits Personal Driver' })).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: 'Trajets' }));
    expect(screen.getByRole('button', { name: 'Affecter la mission' })).toBeDisabled();
    fireEvent.click(screen.getByRole('tab', { name: 'Urgences' }));
    expect(screen.getByRole('button', { name: /Réaffecter un chauffeur d'urgence/i })).toBeDisabled();
  });

  it('exposes compact operation views for subscriptions, trips, and emergencies', () => {
    mockGetDocs.mockResolvedValue({ docs: [] });
    const { PersonalDriverAdminPageClient } = require('./PersonalDriverAdminPageClient');

    render(<PersonalDriverAdminPageClient />);

    expect(screen.getByRole('tablist', { name: 'Vues opérationnelles' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Abonnements' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Trajets' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Urgences' })).toBeInTheDocument();
  });

  it('allows admin to refuse/cancel an unpaid pending subscription', async () => {
    mockGetDocs
      .mockResolvedValueOnce({
        docs: [
          {
            id: 'sub_pending_1',
            data: () => ({
              status: 'pending_payment',
              selectedPlanId: 'classic',
              pickupAddress: '100 Rue Principale',
              createdAt: '2026-09-01T10:00:00Z',
            }),
          },
        ],
      })
      .mockResolvedValue({ docs: [] });

    const { PersonalDriverAdminPageClient } = require('./PersonalDriverAdminPageClient');
    render(<PersonalDriverAdminPageClient />);

    const refuseBtn = await screen.findByRole('button', { name: /Refuser l'abonnement sub_pending_1/i });
    expect(refuseBtn).toBeInTheDocument();

    fireEvent.click(refuseBtn);
    expect(mockCallable).toHaveBeenCalledWith({
      action: 'cancelSubscription',
      subscriptionId: 'sub_pending_1',
      reason: 'Refus administratif ou abandon avant paiement',
    });
    expect(await screen.findByText(/Abonnement sub_pending_1 refusé et annulé avec succès/i)).toBeInTheDocument();
  });

  it('allows admin to validate (approve) operational review on trips', async () => {
    mockGetDocs
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({
        docs: [
          {
            id: 'trip_review_1',
            data: () => ({
              status: 'scheduled',
              scheduledAtIso: '2026-09-05T08:00:00Z',
              pickupAddress: 'Gare Centrale',
              destinationAddress: 'Aéroport',
              operationalReviewRequired: true,
            }),
          },
        ],
      })
      .mockResolvedValue({ docs: [] });

    const { PersonalDriverAdminPageClient } = require('./PersonalDriverAdminPageClient');
    render(<PersonalDriverAdminPageClient />);

    fireEvent.click(screen.getByRole('tab', { name: 'Trajets' }));
    const approveBtn = await screen.findByRole('button', { name: /Valider le trajet trip_review_1/i });
    expect(approveBtn).toBeInTheDocument();

    fireEvent.click(approveBtn);
    expect(mockCallable).toHaveBeenCalledWith({
      action: 'resolveOperationalReview',
      tripId: 'trip_review_1',
      decision: 'approve',
      reason: 'Validé par examen administrateur',
    });
    expect(await screen.findByText(/Examen opérationnel du trajet trip_review_1 : Validé/i)).toBeInTheDocument();
  });

  it('allows admin to refuse (reject) operational review on trips', async () => {
    mockGetDocs
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({
        docs: [
          {
            id: 'trip_review_2',
            data: () => ({
              status: 'scheduled',
              scheduledAtIso: '2026-09-05T08:00:00Z',
              pickupAddress: 'Gare Centrale',
              destinationAddress: 'Aéroport',
              operationalReviewRequired: true,
            }),
          },
        ],
      })
      .mockResolvedValue({ docs: [] });

    const { PersonalDriverAdminPageClient } = require('./PersonalDriverAdminPageClient');
    render(<PersonalDriverAdminPageClient />);

    fireEvent.click(screen.getByRole('tab', { name: 'Trajets' }));
    const rejectBtn = await screen.findByRole('button', { name: /Refuser le trajet trip_review_2/i });
    expect(rejectBtn).toBeInTheDocument();

    fireEvent.click(rejectBtn);
    expect(mockCallable).toHaveBeenCalledWith({
      action: 'resolveOperationalReview',
      tripId: 'trip_review_2',
      decision: 'reject',
      reason: 'Refusé par examen administrateur',
    });
    expect(await screen.findByText(/Examen opérationnel du trajet trip_review_2 : Refusé/i)).toBeInTheDocument();
  });
});
