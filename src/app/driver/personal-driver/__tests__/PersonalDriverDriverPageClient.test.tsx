import { fireEvent, render, screen } from '@testing-library/react';

const mockGetDocs = jest.fn();
const mockHttpsCallable = jest.fn();
const mockWhere = jest.fn(() => ({}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  getDocs: mockGetDocs,
  limit: jest.fn(() => ({})),
  orderBy: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  where: mockWhere,
}));

jest.mock('firebase/functions', () => ({
  httpsCallable: mockHttpsCallable,
}));

jest.mock('@/config/firebase', () => ({ db: {}, functions: {} }));
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ currentUser: { uid: 'driver_1' } }) }));
const mockGetCurrentPosition = jest.fn();
jest.mock('@/hooks/useCapacitorGeolocation', () => ({
  useCapacitorGeolocation: () => ({
    getCurrentPosition: mockGetCurrentPosition,
  }),
}));
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
    expect(mockWhere).toHaveBeenCalledWith('assignedDriverId', '==', 'driver_1');
    expect(mockWhere).toHaveBeenCalledWith('status', 'in', [
      'scheduled', 'driver_assigned', 'driver_en_route', 'driver_arrived', 'passenger_picked_up', 'in_progress',
    ]);
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

    expect((await screen.findByText('trip_selected')).closest('button')).toHaveClass('border-primary');
  });

  it('shows a French alert and lets the driver retry a failed refresh', async () => {
    mockGetDocs
      .mockRejectedValueOnce({ code: 'functions/unavailable' })
      .mockResolvedValueOnce({ docs: [] });
    const { PersonalDriverDriverPageClient } = require('../PersonalDriverDriverPageClient');

    render(<PersonalDriverDriverPageClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/service est momentanément indisponible/i);
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Aucune mission active attribuée pour le moment.')).toBeInTheDocument();
  });

  it('fetches precise GPS position via useCapacitorGeolocation when driver marks arrival', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          id: 'trip_123',
          data: () => ({ status: 'driver_en_route', scheduledAtIso: '2026-08-04T10:00:00.000Z' }),
        },
      ],
    });
    mockGetCurrentPosition.mockResolvedValue({ lat: 48.8566, lng: 2.3522, accuracy: 12 });
    const mockCallableFn = jest.fn().mockResolvedValue({});
    mockHttpsCallable.mockReturnValue(mockCallableFn);

    const { PersonalDriverDriverPageClient } = require('../PersonalDriverDriverPageClient');
    render(<PersonalDriverDriverPageClient />);

    fireEvent.click(await screen.findByText('trip_123'));
    fireEvent.click(screen.getByRole('button', { name: 'Arrivé sur place' }));

    await screen.findByText(/Chauffeur arrivé sur place pour le trajet trip_123/i);

    expect(mockGetCurrentPosition).toHaveBeenCalledWith('tracking', true);
    expect(mockCallableFn).toHaveBeenCalledWith({
      tripId: 'trip_123',
      status: 'driver_arrived',
      lat: 48.8566,
      lng: 2.3522,
      accuracy: 12,
    });
  });

  it('displays error alert and clears waiting message when GPS position acquisition fails on arrival', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          id: 'trip_123',
          data: () => ({ status: 'driver_en_route', scheduledAtIso: '2026-08-04T10:00:00.000Z' }),
        },
      ],
    });
    mockGetCurrentPosition.mockRejectedValue(new Error('Permission de géolocalisation refusée'));

    const { PersonalDriverDriverPageClient } = require('../PersonalDriverDriverPageClient');
    render(<PersonalDriverDriverPageClient />);

    fireEvent.click(await screen.findByText('trip_123'));
    fireEvent.click(screen.getByRole('button', { name: 'Arrivé sur place' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Permission de géolocalisation refusée');
    expect(screen.queryByText(/Acquisition de votre position GPS/i)).not.toBeInTheDocument();
  });

  it('resets selected trip ID to remaining active trip when previously selected trip is completed', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          id: 'trip_next',
          data: () => ({ status: 'driver_assigned', scheduledAtIso: '2026-08-04T12:00:00.000Z' }),
        },
      ],
    });
    const mockCallableFn = jest.fn().mockResolvedValue({});
    mockHttpsCallable.mockReturnValue(mockCallableFn);

    const { PersonalDriverDriverPageClient } = require('../PersonalDriverDriverPageClient');
    render(<PersonalDriverDriverPageClient />);

    expect(await screen.findByText('trip_next')).toBeInTheDocument();
    expect(screen.getByText('trip_next').closest('button')).toHaveClass('border-primary');
  });
});
