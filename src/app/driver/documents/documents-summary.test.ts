import { getDriverDocumentsSummary } from './documents-summary'

describe('driver documents page summary', () => {
  it('returns upload messaging when every document is missing', () => {
    const summary = getDriverDocumentsSummary({
      approved: 0,
      rejected: 0,
      pending: 0,
      notSubmitted: 10,
      total: 10,
      globalStatus: 'pending',
    })

    expect(summary.title).toBe('Documents à téléverser')
  })

  it('returns action required when at least one document is rejected', () => {
    const summary = getDriverDocumentsSummary({
      approved: 2,
      rejected: 1,
      pending: 0,
      notSubmitted: 7,
      total: 10,
      globalStatus: 'has_rejected',
    })

    expect(summary.title).toBe('Action requise')
  })
})
