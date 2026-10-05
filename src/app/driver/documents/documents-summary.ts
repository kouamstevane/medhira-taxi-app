import { translate } from '@/locales'

export interface DriverDocumentsSummaryInput {
  approved: number
  rejected: number
  pending: number
  notSubmitted: number
  total: number
  globalStatus: 'all_approved' | 'has_rejected' | 'pending'
}

export type SummaryTranslationFn = (key: string, params?: Record<string, string | number>) => string

export function getDriverDocumentsSummary(input: DriverDocumentsSummaryInput, t: SummaryTranslationFn = translate) {
  if (input.globalStatus === 'all_approved') {
    return {
      title: t('driver.docSummaryApproved'),
      subtitle: t('driver.docSummaryApprovedSubtitle', { count: input.approved, total: input.total }),
      helper: t('driver.docSummaryApprovedHelper'),
    }
  }

  if (input.globalStatus === 'has_rejected') {
    return {
      title: t('driver.docSummaryActionRequired'),
      subtitle: t('driver.docSummaryRejectedSubtitle', { count: input.rejected }),
      helper: t('driver.docSummaryRejectedHelper'),
    }
  }

  if (input.notSubmitted === input.total) {
    return {
      title: t('driver.docSummaryToUpload'),
      subtitle: t('driver.docSummaryToUploadSubtitle', { total: input.total }),
      helper: t('driver.docSummaryToUploadHelper'),
    }
  }

  if (input.pending > 0 && input.approved === 0 && input.notSubmitted === 0) {
    return {
      title: t('driver.docSummaryPending'),
      subtitle: t('driver.docSummaryPendingSubtitle', { count: input.pending }),
      helper: t('driver.docSummaryPendingHelper'),
    }
  }

  return {
    title: t('driver.docSummaryPending'),
    subtitle: t('driver.docSummaryApprovedSubtitle', { count: input.approved, total: input.total }),
    helper: t('driver.docSummaryReviewHelper'),
  }
}
