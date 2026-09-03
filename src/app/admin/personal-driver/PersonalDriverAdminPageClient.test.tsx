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
  orderBy: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  where: jest.fn(() => ({})),
}));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn() }));
jest.mock('@/config/firebase', () => ({ db: {}, functions: {} }));
jest.mock('@/components/ui/MaterialIcon', () => ({ MaterialIcon: () => <span /> }));

describe('PersonalDriverAdminPageClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    expect(await screen.findByText('Aucun trajet récent à afficher.')).toBeInTheDocument();
  });

  it('mounts the plan editor below the admin heading without removing operational actions', async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });
    const { PersonalDriverAdminPageClient } = require('./PersonalDriverAdminPageClient');

    render(<PersonalDriverAdminPageClient />);

    expect(screen.getByRole('heading', { name: /Administration — Personal Driver Medjira/i })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Forfaits Personal Driver' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Affecter la mission' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Réaffecter un chauffeur d'urgence/i })).toBeDisabled();
  });
});
