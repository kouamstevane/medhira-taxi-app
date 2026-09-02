import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PersonalDriverPage from '../page';
import { PersonalDriverPlansProvider } from '../PersonalDriverPlansProvider';
import { DashboardServiceGrid } from '@/app/dashboard/components/DashboardServiceGrid';
import { getPersonalDriverPlans } from '@/services/personal-driver/plan-config.service';
import { PERSONAL_DRIVER_PLANS } from '@/services/personal-driver/plans';

jest.mock('@/services/personal-driver/plan-config.service', () => ({
  getPersonalDriverPlans: jest.fn(),
}));

const livePlans = {
  ...PERSONAL_DRIVER_PLANS,
  premium: {
    ...PERSONAL_DRIVER_PLANS.premium,
    name: 'Premium Plus',
    badge: 'VIP configurable',
    promise: 'Un service ajuste depuis Firestore',
    pricePerKm: 1.05,
    minimumAmount: 800,
    allowedWeekdays: [1, 2, 3, 4, 5] as const,
    includedRegularWaitMinutes: 12,
    includedSpecialTrips: 6,
    benefits: ['Avantage Premium Plus dynamique'],
  },
};

function renderWithPlans(ui: React.ReactElement) {
  return render(<PersonalDriverPlansProvider>{ui}</PersonalDriverPlansProvider>);
}

describe('Personal Driver client entry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getPersonalDriverPlans as jest.Mock).mockResolvedValue({
      plans: livePlans,
      source: 'firestore',
      error: null,
    });
  });

  it('adds the Personal Driver dashboard entry with the monthly transport CTA', () => {
    render(<DashboardServiceGrid />);

    expect(screen.getByRole('link', { name: /Personal Driver/i })).toHaveAttribute(
      'href',
      '/personal-driver',
    );
    expect(screen.getByText('Personal Driver')).toBeVisible();
    expect(
      screen.getByText('Un chauffeur dédié pour vos trajets réguliers.'),
    ).toBeVisible();
    expect(screen.queryByText('Configurer mon transport mensuel')).not.toBeInTheDocument();
    expect(screen.queryByText(
      /Commander un taxi|Reserver une course maintenant|Trouver un chauffeur/,
    )).not.toBeInTheDocument();
  });

  it('renders the available plans and their required labels', () => {
    renderWithPlans(<PersonalDriverPage />);

    expect(screen.getByRole('heading', { name: /MEDJIRA PERSONAL DRIVER/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Commencer/i })).toHaveAttribute('href', '#forfaits');
    expect(screen.getByRole('heading', { name: 'Basic' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Classic' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Premium' })).toBeInTheDocument();
    expect(screen.getByText('LE PLUS POPULAIRE')).toBeInTheDocument();
    expect(screen.getByText('SERVICE PRIORITAIRE')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Comparer les forfaits/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Aidez-moi à choisir/i })).toBeInTheDocument();
  });

  it('links each plan selection to its configuration route', () => {
    renderWithPlans(<PersonalDriverPage />);

    expect(screen.getByRole('link', { name: 'Choisir Basic' })).toHaveAttribute(
      'href',
      '/personal-driver/configurer?plan=basic',
    );
    expect(screen.getByRole('link', { name: 'Choisir Classic' })).toHaveAttribute(
      'href',
      '/personal-driver/configurer?plan=classic',
    );
    expect(screen.getByRole('link', { name: 'Choisir Premium' })).toHaveAttribute(
      'href',
      '/personal-driver/configurer?plan=premium',
    );
  });

  it('renders card and comparison table values from the loaded catalogue', async () => {
    renderWithPlans(<PersonalDriverPage />);

    expect(await screen.findByRole('heading', { name: 'Premium Plus' })).toBeVisible();
    expect(screen.getByText('VIP CONFIGURABLE')).toBeVisible();
    expect(screen.getByText('Un service ajuste depuis Firestore')).toBeVisible();
    expect(screen.getByText('Avantage Premium Plus dynamique')).toBeVisible();
    expect(screen.getByText(/800 CAD/)).toBeVisible();
    expect(screen.getByText(/1,05 CAD\/km/)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /Comparer les forfaits/i }));

    await waitFor(() => expect(screen.getByRole('dialog', { name: /Tableau comparatif/i })).toBeVisible());
    expect(screen.getByRole('columnheader', { name: 'Premium Plus' })).toBeVisible();
    expect(screen.getByRole('cell', { name: '800 CAD' })).toBeVisible();
    expect(screen.getByRole('cell', { name: '1,05 CAD / km' })).toBeVisible();
    expect(screen.getAllByRole('cell', { name: 'Lun., Mar., Mer., Jeu., Ven.' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('cell', { name: '6 inclus' })).toBeVisible();
    expect(screen.getByRole('cell', { name: '12 min' })).toBeVisible();
  });

  it('keeps static plans visible when catalogue loading fails', async () => {
    (getPersonalDriverPlans as jest.Mock).mockRejectedValue(new Error('Firestore unavailable'));

    renderWithPlans(<PersonalDriverPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/forfaits par défaut/i);
    expect(screen.getByRole('heading', { name: 'Premium' })).toBeVisible();
    expect(screen.getByText(/650 CAD/)).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Premium Plus' })).not.toBeInTheDocument();
  });
});
