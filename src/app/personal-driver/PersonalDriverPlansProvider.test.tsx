import { act, render, screen, waitFor } from '@testing-library/react';
import { PersonalDriverPlansProvider } from './PersonalDriverPlansProvider';
import { usePersonalDriverPlans } from '@/hooks/usePersonalDriverPlans';
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
    minimumAmount: 800,
  },
};

function Probe() {
  const { plans, isLoading, error, reload } = usePersonalDriverPlans();

  return (
    <div>
      <p>{plans.premium.name}</p>
      <p>{plans.premium.minimumAmount}</p>
      <p>{isLoading ? 'loading' : 'idle'}</p>
      {error && <p role="alert">{error.message}</p>}
      <button type="button" onClick={() => void reload()}>Retry</button>
    </div>
  );
}

describe('PersonalDriverPlansProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts from static plans and replaces them with the loaded catalogue', async () => {
    (getPersonalDriverPlans as jest.Mock).mockResolvedValue({
      plans: livePlans,
      source: 'firestore',
      error: null,
    });

    render(
      <PersonalDriverPlansProvider>
        <Probe />
      </PersonalDriverPlansProvider>,
    );

    expect(screen.getByText('Premium')).toBeVisible();
    await waitFor(() => expect(screen.getByText('Premium Plus')).toBeVisible());
    expect(screen.getByText('800')).toBeVisible();
    expect(getPersonalDriverPlans).toHaveBeenCalledTimes(1);
  });

  it('keeps static defaults visible and exposes a retryable non-blocking error', async () => {
    (getPersonalDriverPlans as jest.Mock)
      .mockRejectedValueOnce(new Error('Firestore unavailable'))
      .mockResolvedValueOnce({
        plans: livePlans,
        source: 'firestore',
        error: null,
      });

    render(
      <PersonalDriverPlansProvider>
        <Probe />
      </PersonalDriverPlansProvider>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Firestore unavailable');
    expect(screen.getByText('Premium')).toBeVisible();
    expect(screen.getByText('650')).toBeVisible();

    await act(async () => {
      screen.getByRole('button', { name: 'Retry' }).click();
    });

    await waitFor(() => expect(screen.getByText('Premium Plus')).toBeVisible());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(getPersonalDriverPlans).toHaveBeenCalledTimes(2);
  });
});
