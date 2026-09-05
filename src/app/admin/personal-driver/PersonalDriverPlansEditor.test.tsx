import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { httpsCallable } from 'firebase/functions';
import { getPersonalDriverPlans } from '@/services/personal-driver/plan-config.service';
import { PERSONAL_DRIVER_PLANS } from '@/services/personal-driver/plans';
import { PersonalDriverPlansEditor } from './PersonalDriverPlansEditor';

jest.mock('@/services/personal-driver/plan-config.service', () => ({
  getPersonalDriverPlans: jest.fn(),
}));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn() }));
jest.mock('@/config/firebase', () => ({ functions: {} }));
jest.mock('@/components/ui/MaterialIcon', () => ({ MaterialIcon: () => <span /> }));

const callableMock = jest.fn();
const livePlans = {
  ...PERSONAL_DRIVER_PLANS,
  premium: {
    ...PERSONAL_DRIVER_PLANS.premium,
    name: 'Premium Plus',
    badge: 'VIP configurable',
    promise: 'Un service ajuste depuis Firestore',
  },
};

function arrangeCatalogue() {
  (getPersonalDriverPlans as jest.Mock).mockResolvedValue({
    plans: livePlans,
    source: 'firestore',
    error: null,
    audit: {
      premium: {
        updatedAt: '2026-08-31T10:20:00.000Z',
        updatedBy: 'admin_1',
      },
    },
  });
  (httpsCallable as jest.Mock).mockReturnValue(callableMock);
}

async function openPlan(user: ReturnType<typeof userEvent.setup>, planName: string) {
  const card = within(await screen.findByRole('group', { name: `Forfait ${planName}` }));
  await user.click(card.getByRole('button', { name: `Modifier le forfait ${planName}` }));
  return card;
}

describe('PersonalDriverPlansEditor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    callableMock.mockResolvedValue({ data: { success: true, planId: 'premium' } });
    arrangeCatalogue();
  });

  it('renders every editable field for the three loaded plan cards with audit metadata', async () => {
    render(<PersonalDriverPlansEditor />);
    const user = userEvent.setup();

    for (const planName of ['Basic', 'Classic', 'Premium Plus']) {
      const card = within(await screen.findByRole('group', { name: `Forfait ${planName}` }));
      await user.click(card.getByRole('button', { name: `Modifier le forfait ${planName}` }));

      expect(card.getByRole('textbox', { name: 'Nom' })).toBeVisible();
      expect(card.getByRole('textbox', { name: 'Badge' })).toBeVisible();
      expect(card.getByRole('textbox', { name: 'Promesse' })).toBeVisible();
      expect(card.getByRole('spinbutton', { name: 'Prix par km' })).toBeVisible();
      expect(card.getByRole('spinbutton', { name: 'Distance minimum facturable' })).toBeVisible();
      expect(card.getByRole('spinbutton', { name: 'Montant minimum' })).toBeVisible();
      expect(card.getByRole('spinbutton', { name: 'Minutes d’attente incluses' })).toBeVisible();
      expect(card.getByRole('spinbutton', { name: 'Trajets spéciaux inclus' })).toBeVisible();
      expect(card.getAllByRole('checkbox')).toHaveLength(7);
      expect(card.getByRole('button', { name: /Ajouter un avantage/i })).toBeVisible();
      expect(card.getByRole('button', { name: /Enregistrer/i })).toBeDisabled();
      expect(card.getByText(/Dernière modification/i)).toBeVisible();
      expect(card.getByText(/Modifié par/i)).toBeVisible();
    }

    const premiumCard = within(screen.getByRole('group', { name: 'Forfait Premium Plus' }));
    expect(premiumCard.getByText(/admin_1/i)).toBeVisible();
    expect(premiumCard.getByText(/31\/08\/2026/i)).toBeVisible();
  });

  it('keeps plan cards compact and opens only the selected plan editor', async () => {
    const user = userEvent.setup();
    render(<PersonalDriverPlansEditor />);

    const basicCard = within(await screen.findByRole('group', { name: 'Forfait Basic' }));
    const classicCard = within(screen.getByRole('group', { name: 'Forfait Classic' }));

    expect(basicCard.queryByRole('textbox', { name: 'Nom' })).not.toBeInTheDocument();
    expect(classicCard.queryByRole('textbox', { name: 'Nom' })).not.toBeInTheDocument();

    await user.click(basicCard.getByRole('button', { name: 'Modifier le forfait Basic' }));
    expect(basicCard.getByRole('textbox', { name: 'Nom' })).toBeVisible();
    expect(classicCard.queryByRole('textbox', { name: 'Nom' })).not.toBeInTheDocument();

    await user.click(classicCard.getByRole('button', { name: 'Modifier le forfait Classic' }));
    expect(classicCard.getByRole('textbox', { name: 'Nom' })).toBeVisible();
    expect(basicCard.queryByRole('textbox', { name: 'Nom' })).not.toBeInTheDocument();
  });

  it('saves the full edited Premium plan after changing its minimum amount', async () => {
    const user = userEvent.setup();
    (getPersonalDriverPlans as jest.Mock)
      .mockResolvedValueOnce({
        plans: livePlans,
        source: 'firestore',
        error: null,
        audit: {
          premium: {
            updatedAt: '2026-08-31T10:20:00.000Z',
            updatedBy: 'admin_1',
          },
        },
      })
      .mockResolvedValueOnce({
        plans: {
          ...livePlans,
          premium: {
            ...livePlans.premium,
            minimumAmount: 800,
          },
        },
        source: 'firestore',
        error: null,
        audit: {
          premium: {
            updatedAt: '2026-09-01T09:45:00.000Z',
            updatedBy: 'admin_server',
          },
        },
      });

    render(<PersonalDriverPlansEditor />);

    const premiumCard = await openPlan(user, 'Premium Plus');
    await user.clear(premiumCard.getByRole('spinbutton', { name: 'Montant minimum' }));
    await user.type(premiumCard.getByRole('spinbutton', { name: 'Montant minimum' }), '800');
    await user.click(premiumCard.getByRole('button', { name: 'Enregistrer Premium Plus' }));

    await waitFor(() => expect(callableMock).toHaveBeenCalledTimes(1));
    expect(httpsCallable).toHaveBeenCalledWith({}, 'adminManagePersonalDriver');
    expect(callableMock).toHaveBeenCalledWith({
      action: 'updatePlan',
      plan: {
        ...livePlans.premium,
        minimumAmount: 800,
      },
    });
    await waitFor(() => expect(getPersonalDriverPlans).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/01\/09\/2026/i)).toBeVisible();
    expect(await screen.findByText(/admin_server/i)).toBeVisible();
    expect(screen.queryByText('Mise à jour serveur')).not.toBeInTheDocument();
  });

  it('keeps the saved Premium draft and audit metadata when a post-save reload falls back', async () => {
    const user = userEvent.setup();
    (getPersonalDriverPlans as jest.Mock)
      .mockResolvedValueOnce({
        plans: livePlans,
        source: 'firestore',
        error: null,
        audit: {
          premium: {
            updatedAt: '2026-08-31T10:20:00.000Z',
            updatedBy: 'admin_1',
          },
        },
      })
      .mockResolvedValueOnce({
        plans: PERSONAL_DRIVER_PLANS,
        source: 'fallback',
        error: new Error('Firestore unavailable'),
      });

    render(<PersonalDriverPlansEditor />);

    const premiumCard = await openPlan(user, 'Premium Plus');
    const minimumAmount = premiumCard.getByRole('spinbutton', { name: 'Montant minimum' });
    await user.clear(minimumAmount);
    await user.type(minimumAmount, '800');
    await user.click(premiumCard.getByRole('button', { name: 'Enregistrer Premium Plus' }));

    await waitFor(() => expect(callableMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/synchronisation.*Firestore/i)).toBeVisible();
    expect(minimumAmount).toHaveValue(800);
    expect(premiumCard.getByText(/admin_1/i)).toBeVisible();
    expect(premiumCard.getByText(/31\/08\/2026/i)).toBeVisible();

    await user.clear(minimumAmount);
    await user.type(minimumAmount, '801');
    expect(premiumCard.getByRole('button', { name: 'Enregistrer Premium Plus' })).toBeEnabled();
  });

  it('preserves the edited draft and shows a French alert when saving fails', async () => {
    callableMock.mockRejectedValueOnce({ code: 'functions/unavailable' });
    const user = userEvent.setup();
    render(<PersonalDriverPlansEditor />);

    const premiumCard = await openPlan(user, 'Premium Plus');
    await user.clear(premiumCard.getByRole('spinbutton', { name: 'Montant minimum' }));
    await user.type(premiumCard.getByRole('spinbutton', { name: 'Montant minimum' }), '800');
    await user.click(premiumCard.getByRole('button', { name: 'Enregistrer Premium Plus' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/service est momentanément indisponible/i);
    expect(premiumCard.getByRole('spinbutton', { name: 'Montant minimum' })).toHaveValue(800);
    expect(premiumCard.getByRole('button', { name: 'Enregistrer Premium Plus' })).toBeEnabled();
  });

  it('validates fields before calling the callable', async () => {
    const user = userEvent.setup();
    render(<PersonalDriverPlansEditor />);

    const basicCard = await openPlan(user, 'Basic');
    await user.clear(basicCard.getByRole('textbox', { name: 'Nom' }));
    await user.click(basicCard.getByRole('button', { name: 'Enregistrer Basic' }));

    expect(await basicCard.findByRole('alert')).toHaveTextContent(/Le nom est obligatoire/i);
    expect(callableMock).not.toHaveBeenCalled();
  });

  it('rejects a minimum billable distance above 100000 before calling the callable', async () => {
    const user = userEvent.setup();
    render(<PersonalDriverPlansEditor />);

    const premiumCard = await openPlan(user, 'Premium Plus');
    await user.clear(premiumCard.getByRole('spinbutton', { name: 'Distance minimum facturable' }));
    await user.type(premiumCard.getByRole('spinbutton', { name: 'Distance minimum facturable' }), '100001');
    await user.click(premiumCard.getByRole('button', { name: 'Enregistrer Premium Plus' }));

    expect(await premiumCard.findByRole('alert')).toHaveTextContent(/100000/i);
    expect(callableMock).not.toHaveBeenCalled();
  });

  it('updates weekday checkboxes and benefit rows in the saved draft', async () => {
    const user = userEvent.setup();
    render(<PersonalDriverPlansEditor />);

    const basicCard = await openPlan(user, 'Basic');
    await user.click(basicCard.getByRole('checkbox', { name: 'Dimanche' }));
    await user.click(basicCard.getByRole('button', { name: 'Ajouter un avantage Basic' }));
    await user.type(basicCard.getByRole('textbox', { name: 'Avantage 4' }), 'Support prioritaire');
    await user.click(basicCard.getByRole('button', { name: /Supprimer l’avantage 2/i }));
    await user.click(basicCard.getByRole('button', { name: 'Enregistrer Basic' }));

    await waitFor(() => expect(callableMock).toHaveBeenCalledTimes(1));
    const payload = callableMock.mock.calls[0][0];
    expect(payload.plan.allowedWeekdays).toEqual([0, 1, 2, 3, 4, 5]);
    expect(payload.plan.benefits).toEqual([
      'Service du lundi au vendredi',
      'Horaires fixes',
      'Support prioritaire',
    ]);
  });

  it('resets a changed plan without saving', async () => {
    const user = userEvent.setup();
    render(<PersonalDriverPlansEditor />);

    const basicCard = await openPlan(user, 'Basic');
    await user.clear(basicCard.getByRole('textbox', { name: 'Nom' }));
    await user.type(basicCard.getByRole('textbox', { name: 'Nom' }), 'Basic modifié');

    expect(basicCard.getByRole('button', { name: 'Enregistrer Basic modifié' })).toBeEnabled();
    await user.click(basicCard.getByRole('button', { name: 'Réinitialiser Basic modifié' }));

    expect(basicCard.getByRole('textbox', { name: 'Nom' })).toHaveValue('Basic');
    expect(basicCard.getByRole('button', { name: 'Enregistrer Basic' })).toBeDisabled();
    expect(callableMock).not.toHaveBeenCalled();
  });

  it('resets a changed plan to static defaults even when Firestore has overrides', async () => {
    const user = userEvent.setup();
    render(<PersonalDriverPlansEditor />);

    const premiumCard = await openPlan(user, 'Premium Plus');
    expect(premiumCard.getByRole('textbox', { name: 'Nom' })).toHaveValue('Premium Plus');
    await user.clear(premiumCard.getByRole('textbox', { name: 'Nom' }));
    await user.type(premiumCard.getByRole('textbox', { name: 'Nom' }), 'Nom temporaire');
    await user.click(premiumCard.getByRole('button', { name: 'Réinitialiser Nom temporaire' }));

    expect(premiumCard.getByRole('textbox', { name: 'Nom' })).toHaveValue('Premium');
    expect(premiumCard.getByRole('textbox', { name: 'Badge' })).toHaveValue('Service prioritaire');
    expect(callableMock).not.toHaveBeenCalled();
  });
});
