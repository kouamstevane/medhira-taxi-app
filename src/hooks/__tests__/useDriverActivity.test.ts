import { renderHook } from '@testing-library/react'
import { useDriverActivity } from '../useDriverActivity'

// Mock firebase/firestore
jest.mock('@/config/firebase', () => ({ db: {} }))
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  onSnapshot: jest.fn(() => jest.fn()),
  Timestamp: class { toDate() { return new Date() } },
}))

describe('useDriverActivity', () => {
  it('exports useDriverActivity function', () => {
    expect(typeof useDriverActivity).toBe('function')
  })

  it('returns records, totals, loading shape', () => {
    const { result } = renderHook(() => useDriverActivity('uid123'))
    expect(result.current).toHaveProperty('records')
    expect(result.current).toHaveProperty('totals')
    expect(result.current).toHaveProperty('loading')
  })

  it('totals has total, taxi, livraison fields', () => {
    const { result } = renderHook(() => useDriverActivity('uid123'))
    expect(result.current.totals).toHaveProperty('total')
    expect(result.current.totals).toHaveProperty('taxi')
    expect(result.current.totals).toHaveProperty('livraison')
  })
})
