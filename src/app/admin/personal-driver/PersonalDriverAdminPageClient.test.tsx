import { fireEvent, render, screen } from '@testing-library/react';
import { getPersonalDriverPlans } from '@/services/personal-driver/plan-config.service';
import { PERSONAL_DRIVER_PLANS } from '@/services/personal-driver/plans';

const mockGetDocs = jest.fn();
const mockWhere = jest.fn((...args: unknown[]) => ({ args }));

jest.mock('@/services/personal-driver/plan-config.service', () => ({
  getPersonalDriverPlans: jest.fn(),
}));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  getDocs: mockGetDocs,
  limit: jest.fn(() => ({})),
  orderBy: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  where: mockWhere,
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

  it('computes a complete calendar month range from a YYYY-MM value', () => {
    const { getDateRange } = require('./PersonalDriverAdminPageClient');

    expect(getDateRange({ preset: 'month', month: '2026-02' })).toEqual({
      start: new Date('2026-02-01T00:00:00.000Z'),
      end: new Date('2026-03-01T00:00:00.000Z'),
    });
  });

  it('uses the current calendar year for the year preset', () => {
    const { getDateRange } = require('./PersonalDriverAdminPageClient');

    expect(getDateRange({ preset: 'year', month: '' }, new Date('2026-09-07T12:00:00.000Z'))).toEqual({
      start: new Date('2026-01-01T00:00:00.000Z'),
      end: new Date('2027-01-01T00:00:00.000Z'),
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

  it('mounts the plan editor without duplicating the admin heading or removing operational actions', async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });
    const { PersonalDriverAdminPageClient } = require('./PersonalDriverAdminPageClient');

    render(<PersonalDriverAdminPageClient />);

    expect(screen.queryByRole('heading', { name: /Administration — Personal Driver Medjira/i })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Forfaits Personal Driver' })).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: 'Trajets' }));
    fireEvent.click(screen.getByRole('button', { name: 'Afficher le formulaire d’affectation' }));
    expect(screen.getByRole('button', { name: 'Affecter la mission' })).toBeDisabled();
    fireEvent.click(screen.getByRole('tab', { name: 'Urgences' }));
    expect(screen.getByRole('button', { name: /Réaffecter un chauffeur d'urgence/i })).toBeDisabled();
  });

  it('keeps the trip list and assignment form mutually exclusive', () => {
    mockGetDocs.mockResolvedValue({ docs: [] });
    const { PersonalDriverAdminPageClient } = require('./PersonalDriverAdminPageClient');

    render(<PersonalDriverAdminPageClient />);
    fireEvent.click(screen.getByRole('tab', { name: 'Trajets' }));

    expect(screen.getByRole('button', { name: 'Réduire la liste des trajets' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Affecter la mission' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Afficher le formulaire d’affectation' }));

    expect(screen.getByRole('button', { name: 'Réduire le formulaire d’affectation' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Réduire la liste des trajets' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Affecter la mission' })).toBeDisabled();
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

  it('applies and resets a month filter from the compact panel', async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });
    const { PersonalDriverAdminPageClient } = require('./PersonalDriverAdminPageClient');
    render(<PersonalDriverAdminPageClient />);

    fireEvent.click(screen.getByRole('button', { name: /Filtres/i }));
    expect(screen.getByRole('dialog', { name: 'Filtrer les opérations' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Un mois précis' }));
    fireEvent.change(screen.getByLabelText('Mois'), { target: { value: '2026-02' } });
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer les filtres' }));
    expect(screen.queryByRole('dialog', { name: 'Filtrer les opérations' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Filtres.*actif/i })).toBeInTheDocument();
    expect(mockWhere).toHaveBeenCalledWith('createdAt', '>=', expect.any(Date));
    expect(mockWhere).toHaveBeenCalledWith('createdAt', '<', expect.any(Date));

    fireEvent.click(screen.getByRole('button', { name: /Filtres.*actif/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    expect(screen.queryByRole('dialog', { name: 'Filtrer les opérations' })).not.toBeInTheDocument();
  });

  it('keeps the month filter actionable when the browser emits an input event', () => {
    mockGetDocs.mockResolvedValue({ docs: [] });
    const { PersonalDriverAdminPageClient } = require('./PersonalDriverAdminPageClient');
    render(<PersonalDriverAdminPageClient />);

    fireEvent.click(screen.getByRole('button', { name: /Filtres/i }));
    fireEvent.click(screen.getByRole('radio', { name: 'Un mois précis' }));
    const monthInput = screen.getByLabelText('Mois');
    fireEvent.input(monthInput, { target: { value: '2026-08' } });

    expect(screen.getByRole('button', { name: 'Appliquer les filtres' })).not.toBeDisabled();
  });

  it('preselects the current month when the month preset is chosen', () => {
    mockGetDocs.mockResolvedValue({ docs: [] });
    const { PersonalDriverAdminPageClient } = require('./PersonalDriverAdminPageClient');
    render(<PersonalDriverAdminPageClient />);

    fireEvent.click(screen.getByRole('button', { name: /Filtres/i }));
    fireEvent.click(screen.getByRole('radio', { name: 'Un mois précis' }));

    const currentMonth = new Date().toISOString().slice(0, 7);
    expect(screen.getByLabelText('Mois')).toHaveValue(currentMonth);
    expect(screen.getByRole('button', { name: 'Appliquer les filtres' })).not.toBeDisabled();
  });

  it('keeps the filter panel within the mobile viewport', () => {
    mockGetDocs.mockResolvedValue({ docs: [] });
    const { PersonalDriverAdminPageClient } = require('./PersonalDriverAdminPageClient');
    render(<PersonalDriverAdminPageClient />);

    fireEvent.click(screen.getByRole('button', { name: /Filtres/i }));

    expect(screen.getByRole('dialog', { name: 'Filtrer les opérations' })).toHaveClass('max-h-[calc(100dvh-1rem)]', 'overflow-y-auto');
  });

  it('shows a readable subscription summary instead of the Firestore document id', async () => {
    const technicalSubscriptionId = '6af0a871b051eb2c9653b7bce809a1e397c030044b4a727212787486b8414bed';
    mockGetDocs
      .mockResolvedValueOnce({
        docs: [
          {
            id: technicalSubscriptionId,
            data: () => ({
              status: 'active',
              selectedPlanId: 'basic',
              pickupAddress: '2021 209 Street Northwest',
              destinationAddress: 'Centre-ville Edmonton',
            }),
          },
        ],
      })
      .mockResolvedValue({ docs: [] });

    const { PersonalDriverAdminPageClient } = require('./PersonalDriverAdminPageClient');
    render(<PersonalDriverAdminPageClient />);

    expect(await screen.findByRole('button', { name: /Forfait Basic.*Actif.*2021 209 Street Northwest.*Centre-ville Edmonton/i })).toBeInTheDocument();
    expect(screen.queryByText(technicalSubscriptionId)).not.toBeInTheDocument();
  });

  it('shows a readable trip summary instead of the generated trip id', async () => {
    const technicalTripId = '6af0a871b051eb2c9653b7bce809a1e397c030044b4a727212787486b8414bed_0';
    mockGetDocs
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({
        docs: [
          {
            id: technicalTripId,
            data: () => ({
              status: 'scheduled',
              direction: 'outbound',
              scheduledAtIso: '2026-09-05T08:00:00.000Z',
              pickupAddress: 'Gare Centrale',
              destinationAddress: 'Aéroport',
            }),
          },
        ],
      })
      .mockResolvedValue({ docs: [] });

    const { PersonalDriverAdminPageClient } = require('./PersonalDriverAdminPageClient');
    render(<PersonalDriverAdminPageClient />);
    fireEvent.click(screen.getByRole('tab', { name: 'Trajets' }));

    expect(await screen.findByRole('button', { name: /Aller · Planifié.*Gare Centrale.*Aéroport/i })).toBeInTheDocument();
    expect(screen.queryByText(technicalTripId)).not.toBeInTheDocument();
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
