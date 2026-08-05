import { fireEvent, render, screen } from '@testing-library/react';

const mockGetDocs = jest.fn();
const mockHttpsCallable = jest.fn();

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  getDocs: mockGetDocs,
  query: jest.fn(() => ({})),
  where: jest.fn(() => ({})),
}));

jest.mock('firebase/functions', () => ({
  httpsCallable: mockHttpsCallable,
}));

jest.mock('@/config/firebase', () => ({ db: {}, functions: {} }));
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ currentUser: { uid: 'driver_1' } }) }));
jest.mock('@/components/ui/MaterialIcon', () => ({ MaterialIcon: () => <span /> }));

function makeTrip(waitEndedAt?: unknown) {
  return {
    id: 'trip_waiting',
    data: () => ({
      status: 'driver_arrived',
      scheduledAtIso: '2026-08-04T11:00:00.000Z',
      waitStartedAt: { toDate: () => new Date('2026-08-04T11:58:00.000Z') },
      ...(waitEndedAt ? { waitEndedAt } : {}),
    }),
  };
}

describe('PersonalDriverDriverPageClient', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-04T12:00:00.000Z'));
    jest.clearAllMocks();
  });

  afterEach(() => jest.useRealTimers());

  it('rehydrates the waiting trip and resumes the timer from waitStartedAt', async () => {
    mockGetDocs.mockResolvedValue({ docs: [makeTrip()] });
    const { PersonalDriverDriverPageClient } = require('../PersonalDriverDriverPageClient');

    render(<PersonalDriverDriverPageClient />);

    expect(await screen.findByText("Chronomètre d'attente en cours")).toBeInTheDocument();
    expect(screen.getByText('02:00')).toBeInTheDocument();
    expect(mockHttpsCallable).not.toHaveBeenCalledWith(expect.anything(), 'chargePersonalDriverWaitTimeOverage');
  });

  it('does not resume a timer when the server has recorded waitEndedAt', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [makeTrip({ toDate: () => new Date('2026-08-04T12:00:00.000Z') })],
    });
    const { PersonalDriverDriverPageClient } = require('../PersonalDriverDriverPageClient');

    render(<PersonalDriverDriverPageClient />);

    expect(await screen.findByText('trip_waiting')).toBeInTheDocument();
    expect(screen.queryByText("Chronomètre d'attente en cours")).not.toBeInTheDocument();
  });

  it('does not override an existing selected mission when it refreshes', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          id: 'trip_selected',
          data: () => ({ status: 'driver_en_route', scheduledAtIso: '2026-08-04T10:00:00.000Z' }),
        },
        makeTrip(),
      ],
    });
    const { PersonalDriverDriverPageClient } = require('../PersonalDriverDriverPageClient');

    render(<PersonalDriverDriverPageClient />);
    fireEvent.click(await screen.findByText('trip_selected'));
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser' }));

    expect(await screen.findByDisplayValue('trip_selected')).toBeInTheDocument();
  });
});
