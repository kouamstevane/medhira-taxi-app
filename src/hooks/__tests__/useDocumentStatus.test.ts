// src/hooks/__tests__/useDocumentStatus.test.ts
import type { DocumentStatusEntry } from '../useDocumentStatus'

describe('useDocumentStatus — logique globale', () => {
  function computeGlobalStatus(entries: Pick<DocumentStatusEntry, 'status'>[]): string {
    const allApproved = entries.length > 0 && entries.every(e => e.status === 'approved')
    const hasRejected = entries.some(e => e.status === 'rejected')
    return allApproved ? 'all_approved' : hasRejected ? 'has_rejected' : 'pending'
  }

  it('all_approved si tous approved', () => {
    const entries = [{ status: 'approved' as const }, { status: 'approved' as const }]
    expect(computeGlobalStatus(entries)).toBe('all_approved')
  })

  it('has_rejected si au moins un rejected', () => {
    const entries = [{ status: 'approved' as const }, { status: 'rejected' as const }]
    expect(computeGlobalStatus(entries)).toBe('has_rejected')
  })

  it('pending si mélange pending/not_submitted', () => {
    const entries = [{ status: 'pending' as const }, { status: 'not_submitted' as const }]
    expect(computeGlobalStatus(entries)).toBe('pending')
  })

  it('pending si liste vide', () => {
    expect(computeGlobalStatus([])).toBe('pending')
  })

  it('has_rejected prime sur pending', () => {
    const entries = [{ status: 'pending' as const }, { status: 'rejected' as const }]
    expect(computeGlobalStatus(entries)).toBe('has_rejected')
  })
})
