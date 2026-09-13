export interface DriverDocumentsSummaryInput {
  approved: number
  rejected: number
  pending: number
  notSubmitted: number
  total: number
  globalStatus: 'all_approved' | 'has_rejected' | 'pending'
}

export type SummaryTranslationFn = (key: string, params?: Record<string, string | number>) => string

export function getDriverDocumentsSummary(input: DriverDocumentsSummaryInput, t?: SummaryTranslationFn) {
  if (t) {
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

  if (input.globalStatus === 'all_approved') {
    return {
      title: 'Documents approuvés',
      subtitle: `${input.approved} document${input.approved > 1 ? 's' : ''} approuvé${input.approved > 1 ? 's' : ''} sur ${input.total}`,
      helper: 'Tous vos documents requis ont été validés.',
    }
  }

  if (input.globalStatus === 'has_rejected') {
    return {
      title: 'Action requise',
      subtitle: `${input.rejected} document${input.rejected > 1 ? 's' : ''} à corriger`,
      helper: 'Corrigez les documents refusés pour relancer la vérification.',
    }
  }

  if (input.notSubmitted === input.total) {
    return {
      title: 'Documents à téléverser',
      subtitle: `0 document approuvé sur ${input.total}`,
      helper: 'Téléversez tous les documents requis pour activer votre compte chauffeur.',
    }
  }

  if (input.pending > 0 && input.approved === 0 && input.notSubmitted === 0) {
    return {
      title: 'Vérification en cours',
      subtitle: `${input.pending} document${input.pending > 1 ? 's' : ''} en cours de vérification`,
      helper: 'Vos documents envoyés sont en cours de vérification.',
    }
  }

  return {
    title: 'Vérification en cours',
    subtitle: `${input.approved} document${input.approved > 1 ? 's' : ''} approuvé${input.approved > 1 ? 's' : ''} sur ${input.total}`,
    helper: 'Complétez les pièces manquantes et suivez la validation de vos documents.',
  }
}
