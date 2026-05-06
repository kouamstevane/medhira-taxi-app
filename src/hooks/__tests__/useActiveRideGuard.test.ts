import { renderHook, act } from '@testing-library/react'
import { useActiveRideGuard } from '../useActiveRideGuard'
import * as useAuthModule from '@/hooks/useAuth'

const mockOnSnapshot = jest.fn()
const mockUnsubscribe = jest.fn()

jest.mock('@/config/firebase', () => ({ db: {} }))
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  onSnapshot: (...args: unknown[]) => {
    mockOnSnapshot(...args)
    return mockUnsubscribe
  },
}))
jest.mock('@/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}))

const mockUseAuth = useAuthModule.useAuth as jest.Mock

describe('useActiveRideGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns hasActiveRide=false and loading=false when user has no driver role', () => {
    mockUseAuth.mockReturnValue({
      currentUser: { uid: 'user1' } as never,
      userData: { roles: { driver: false } } as never,
    } as never)

    const { result } = renderHook(() => useActiveRideGuard())
    expect(result.current.hasActiveRide).toBe(false)
    expect(result.current.loading).toBe(false)
    expect(mockOnSnapshot).not.toHaveBeenCalled()
  })

  it('returns hasActiveRide=true when driver has an active ride (snapshot not empty)', () => {
    mockUseAuth.mockReturnValue({
      currentUser: { uid: 'driver1' } as never,
      userData: { roles: { driver: true } } as never,
    } as never)

    let snapshotCallback: (snap: { empty: boolean }) => void = () => {}
    mockOnSnapshot.mockImplementation((q: unknown, cb: (snap: { empty: boolean }) => void) => {
      snapshotCallback = cb
      return mockUnsubscribe
    })

    const { result } = renderHook(() => useActiveRideGuard())

    act(() => {
      snapshotCallback({ empty: false })
    })

    expect(result.current.hasActiveRide).toBe(true)
    expect(result.current.loading).toBe(false)
  })

  it('returns hasActiveRide=false when driver has no active ride (snapshot empty)', () => {
    mockUseAuth.mockReturnValue({
      currentUser: { uid: 'driver1' } as never,
      userData: { roles: { driver: true } } as never,
    } as never)

    let snapshotCallback: (snap: { empty: boolean }) => void = () => {}
    mockOnSnapshot.mockImplementation((q: unknown, cb: (snap: { empty: boolean }) => void) => {
      snapshotCallback = cb
      return mockUnsubscribe
    })

    const { result } = renderHook(() => useActiveRideGuard())

    act(() => {
      snapshotCallback({ empty: true })
    })

    expect(result.current.hasActiveRide).toBe(false)
    expect(result.current.loading).toBe(false)
  })

  it('calls unsubscribe on unmount', () => {
    mockUseAuth.mockReturnValue({
      currentUser: { uid: 'driver1' } as never,
      userData: { roles: { driver: true } } as never,
    } as never)

    const { unmount } = renderHook(() => useActiveRideGuard())
    expect(mockUnsubscribe).not.toHaveBeenCalled()

    unmount()
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1)
  })
})
