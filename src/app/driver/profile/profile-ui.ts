import type { DocStatus } from '@/hooks/useDocumentStatus';

interface VehicleSummaryInput {
  model?: string | null;
  plate?: string | null;
  color?: string | null;
}

interface DocumentSummaryInput {
  status: DocStatus;
}

export interface VehicleProfileSummary {
  title: string;
  subtitle: string;
  isComplete: boolean;
}

export interface DocumentsProfileSummary {
  title: string;
  subtitle: string;
  tone: 'danger' | 'warning' | 'success' | 'neutral';
  cta: string;
}

export interface DriverVerificationBadge {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
}

export interface DriverAvailabilityProfileState {
  label: string;
  detail: string;
  description: string;
  isInteractive: boolean;
  displayAvailable: boolean;
}

export type ProfileTranslationFn = (key: string, params?: Record<string, string | number>) => string;

function clean(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function getVehicleProfileSummary(car?: VehicleSummaryInput | null, t?: ProfileTranslationFn): VehicleProfileSummary {
  const model = clean(car?.model);
  const plate = clean(car?.plate);
  const color = clean(car?.color);
  const details = [plate, color].filter(Boolean);

  const fallbackTitle = t ? t('driver.vehicleIncompleteTitle') : 'Véhicule à compléter';
  if (!model && details.length === 0) {
    return {
      title: fallbackTitle,
      subtitle: t ? t('driver.vehicleIncompleteSubtitle') : 'Ajoutez modèle, plaque et couleur',
      isComplete: false,
    };
  }

  return {
    title: model ?? fallbackTitle,
    subtitle: details.length > 0 ? details.join(' • ') : (t ? t('driver.vehicleAddPlateAndColor') : 'Ajoutez la plaque et la couleur'),
    isComplete: Boolean(model && plate && color),
  };
}

export function getDocumentsProfileSummary(documents: DocumentSummaryInput[], t?: ProfileTranslationFn): DocumentsProfileSummary {
  if (documents.length === 0) {
    return {
      title: t ? t('driver.docsToUploadTitle') : 'Documents à téléverser',
      subtitle: t ? t('driver.docsToUploadSubtitle') : 'Ouvrez Documents pour commencer.',
      tone: 'neutral',
      cta: t ? t('driver.btnOpen') : 'Ouvrir',
    };
  }

  const actionCount = documents.filter((document) => document.status === 'not_submitted' || document.status === 'rejected').length;
  if (actionCount > 0) {
    return {
      title: t ? t('driver.docsToCompleteTitle', { count: actionCount }) : `${actionCount} document${actionCount > 1 ? 's' : ''} à compléter`,
      subtitle: t ? t('driver.docsToCompleteSubtitle') : 'Ouvrez Documents pour corriger ou téléverser les pièces.',
      tone: 'danger',
      cta: t ? t('driver.btnComplete') : 'Compléter',
    };
  }

  const pendingCount = documents.filter((document) => document.status === 'pending').length;
  if (pendingCount > 0) {
    return {
      title: t ? t('driver.docsInVerificationTitle') : 'Documents en vérification',
      subtitle: t ? t('driver.docsInVerificationSubtitle', { count: pendingCount }) : `${pendingCount} document${pendingCount > 1 ? 's' : ''} en attente de validation.`,
      tone: 'warning',
      cta: t ? t('driver.btnView') : 'Voir',
    };
  }

  const approvedCount = documents.filter((document) => document.status === 'approved').length;
  return {
    title: t ? t('driver.docsValidatedTitle') : 'Documents validés',
    subtitle: t ? t('driver.docsValidatedSubtitle', { approved: approvedCount, total: documents.length }) : `${approvedCount}/${documents.length} documents approuvés.`,
    tone: 'success',
    cta: t ? t('driver.btnConsult') : 'Consulter',
  };
}

export function getDriverVerificationBadges({
  isEmailVerified,
  driverStatus,
  t,
}: {
  isEmailVerified: boolean;
  driverStatus?: string | null;
  t?: ProfileTranslationFn;
}): DriverVerificationBadge[] {
  const badges: DriverVerificationBadge[] = [
    {
      label: isEmailVerified ? (t ? t('driver.emailVerifiedBadge') : 'Email vérifié') : (t ? t('driver.emailToVerifyBadge') : 'Email à vérifier'),
      tone: isEmailVerified ? 'success' : 'warning',
    },
  ];

  switch (driverStatus) {
    case 'approved':
      badges.push({ label: t ? t('driver.driverApprovedBadge') : 'Compte chauffeur approuvé', tone: 'success' });
      break;
    case 'rejected':
    case 'action_required':
    case 'suspended':
      badges.push({ label: t ? t('driver.dossierToCorrect') : 'Dossier à corriger', tone: 'danger' });
      break;
    default:
      badges.push({ label: t ? t('driver.dossierPending') : 'Dossier en attente', tone: 'warning' });
      break;
  }

  return badges;
}

export function getDriverAvailabilityProfileState({
  isApproved,
  isAvailable,
  t,
}: {
  isApproved: boolean;
  isAvailable: boolean;
  t?: ProfileTranslationFn;
}): DriverAvailabilityProfileState {
  if (!isApproved) {
    return {
      label: t ? t('driver.driverAvailabilityTitle') : 'Disponibilité chauffeur',
      detail: t ? t('driver.driverAvailableAfterValidation') : 'Disponible après validation admin',
      description: t ? t('driver.driverMustBeApprovedDesc') : 'Votre compte doit être approuvé avant de recevoir des courses.',
      isInteractive: false,
      displayAvailable: false,
    };
  }

  if (isAvailable) {
    return {
      label: t ? t('driver.driverAvailableForRides') : 'Disponible pour des courses',
      detail: t ? t('driver.driverActivated') : 'Activée',
      description: t ? t('driver.driverCanReceiveNowDesc') : 'Vous pouvez recevoir des demandes dès maintenant.',
      isInteractive: true,
      displayAvailable: true,
    };
  }

  return {
    label: t ? t('driver.driverAvailableForRides') : 'Disponible pour des courses',
    detail: t ? t('driver.driverDeactivated') : 'Désactivée',
    description: t ? t('driver.driverEnableToReceiveDesc') : 'Activez cette option pour recevoir des demandes.',
    isInteractive: true,
    displayAvailable: false,
  };
}
