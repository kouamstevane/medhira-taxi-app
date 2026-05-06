import { renderHook, waitFor } from '@testing-library/react';
import { useEffectiveRoleStatus } from '../useEffectiveRoleStatus';

jest.mock('@/config/firebase', () => ({ db: {} }));

const mockOnSnapshot = jest.fn();
jest.mock('firebase/firestore', () => ({
  onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
  doc: jest.fn((_db: unknown, collection: string, id: string) => ({ collection, id })),
}));

const mockUseAuth = jest.fn();
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

function makeUser(roles: Record<string, unknown>) {
  return {
    uid: 'uid1',
    roles,
    activeRole: 'client' as const,
    emailVerified: true,
    firstName: 'Test',
    lastName: 'User',
    createdAt: {},
    updatedAt: {},
  };
}

function makeFirebaseUser() {
  return { uid: 'uid1' };
}

describe('useEffectiveRoleStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns nulls when user has only client role', () => {
    mockUseAuth.mockReturnValue({
      currentUser: makeFirebaseUser(),
      userData: makeUser({ client: { enabled: true, joinedAt: {} } }),
    });
    mockOnSnapshot.mockReturnValue(jest.fn());

    const { result } = renderHook(() => useEffectiveRoleStatus());
    expect(result.current.driver).toBeNull();
    expect(result.current.restaurant).toBeNull();
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });

  it('subscribes to driver snapshot and reflects status', async () => {
    mockUseAuth.mockReturnValue({
      currentUser: makeFirebaseUser(),
      userData: makeUser({
        client: { enabled: true, joinedAt: {} },
        driver: { joinedAt: {} },
      }),
    });

    let snapshotCallback: (snap: { data: () => Record<string, unknown> }) => void = () => {};
    mockOnSnapshot.mockImplementation((_ref: unknown, cb: (snap: { data: () => Record<string, unknown> }) => void) => {
      snapshotCallback = cb;
      return jest.fn();
    });

    const { result } = renderHook(() => useEffectiveRoleStatus());

    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
    expect(mockOnSnapshot).toHaveBeenCalledWith(
      { collection: 'drivers', id: 'uid1' },
      expect.any(Function),
    );

    snapshotCallback({ data: () => ({ status: 'approved' }) });

    await waitFor(() => {
      expect(result.current.driver).toEqual({ status: 'approved', loading: false });
    });
  });

  it('subscribes to restaurant snapshot and reflects status + stripeConnectStatus', async () => {
    mockUseAuth.mockReturnValue({
      currentUser: makeFirebaseUser(),
      userData: makeUser({
        client: { enabled: true, joinedAt: {} },
        restaurant: { restaurantId: 'resto1', joinedAt: {} },
      }),
    });

    let snapshotCallback: (snap: { data: () => Record<string, unknown> }) => void = () => {};
    mockOnSnapshot.mockImplementation((_ref: unknown, cb: (snap: { data: () => Record<string, unknown> }) => void) => {
      snapshotCallback = cb;
      return jest.fn();
    });

    const { result } = renderHook(() => useEffectiveRoleStatus());

    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
    expect(mockOnSnapshot).toHaveBeenCalledWith(
      { collection: 'restaurants', id: 'resto1' },
      expect.any(Function),
    );

    snapshotCallback({
      data: () => ({ status: 'approved', stripeConnectStatus: 'active' }),
    });

    await waitFor(() => {
      expect(result.current.restaurant).toEqual({
        restaurantId: 'resto1',
        status: 'approved',
        stripeConnectStatus: 'active',
        loading: false,
      });
    });
  });

  it('subscribes to both driver and restaurant when user has both roles', () => {
    mockUseAuth.mockReturnValue({
      currentUser: makeFirebaseUser(),
      userData: makeUser({
        client: { enabled: true, joinedAt: {} },
        driver: { joinedAt: {} },
        restaurant: { restaurantId: 'resto1', joinedAt: {} },
      }),
    });

    mockOnSnapshot.mockReturnValue(jest.fn());

    renderHook(() => useEffectiveRoleStatus());

    expect(mockOnSnapshot).toHaveBeenCalledTimes(2);
    expect(mockOnSnapshot).toHaveBeenCalledWith(
      { collection: 'drivers', id: 'uid1' },
      expect.any(Function),
    );
    expect(mockOnSnapshot).toHaveBeenCalledWith(
      { collection: 'restaurants', id: 'resto1' },
      expect.any(Function),
    );
  });

  it('calls unsubscribe on unmount', () => {
    mockUseAuth.mockReturnValue({
      currentUser: makeFirebaseUser(),
      userData: makeUser({
        client: { enabled: true, joinedAt: {} },
        driver: { joinedAt: {} },
      }),
    });

    const unsubDriver = jest.fn();
    mockOnSnapshot.mockReturnValue(unsubDriver);

    const { unmount } = renderHook(() => useEffectiveRoleStatus());
    unmount();

    expect(unsubDriver).toHaveBeenCalledTimes(1);
  });

  it('returns nulls when no currentUser', () => {
    mockUseAuth.mockReturnValue({
      currentUser: null,
      userData: null,
    });
    mockOnSnapshot.mockReturnValue(jest.fn());

    const { result } = renderHook(() => useEffectiveRoleStatus());
    expect(result.current.driver).toBeNull();
    expect(result.current.restaurant).toBeNull();
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });

  it('uses defaults when snapshot data is missing', async () => {
    mockUseAuth.mockReturnValue({
      currentUser: makeFirebaseUser(),
      userData: makeUser({
        client: { enabled: true, joinedAt: {} },
        driver: { joinedAt: {} },
        restaurant: { restaurantId: 'resto1', joinedAt: {} },
      }),
    });

    const callbacks: Array<(snap: { data: () => Record<string, unknown> }) => void> = [];
    mockOnSnapshot.mockImplementation((_ref: unknown, cb: (snap: { data: () => Record<string, unknown> }) => void) => {
      callbacks.push(cb);
      return jest.fn();
    });

    const { result } = renderHook(() => useEffectiveRoleStatus());

    callbacks[0]({ data: () => ({}) });
    callbacks[1]({ data: () => ({}) });

    await waitFor(() => {
      expect(result.current.driver).toEqual({ status: 'pending', loading: false });
      expect(result.current.restaurant).toEqual({
        restaurantId: 'resto1',
        status: 'pending_approval',
        stripeConnectStatus: 'not_started',
        loading: false,
      });
    });
  });
});
