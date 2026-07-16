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

function clean(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function getVehicleProfileSummary(car?: VehicleSummaryInput | null): VehicleProfileSummary {
  const model = clean(car?.model);
  const plate = clean(car?.plate);
  const color = clean(car?.color);
  const details = [plate, color].filter(Boolean);

  if (!model && details.length === 0) {
    return {
      title: 'Véhicule à compléter',
      subtitle: 'Ajoutez modèle, plaque et couleur',
      isComplete: false,
    };
  }

  return {
    title: model ?? 'Véhicule à compléter',
    subtitle: details.length > 0 ? details.join(' • ') : 'Ajoutez la plaque et la couleur',
    isComplete: Boolean(model && plate && color),
  };
}

export function getDocumentsProfileSummary(documents: DocumentSummaryInput[]): DocumentsProfileSummary {
  if (documents.length === 0) {
    return {
      title: 'Documents à téléverser',
      subtitle: 'Ouvrez Documents pour commencer.',
      tone: 'neutral',
      cta: 'Ouvrir',
    };
  }

  const actionCount = documents.filter((document) => document.status === 'not_submitted' || document.status === 'rejected').length;
  if (actionCount > 0) {
    return {
      title: `${actionCount} document${actionCount > 1 ? 's' : ''} à compléter`,
      subtitle: 'Ouvrez Documents pour corriger ou téléverser les pièces.',
      tone: 'danger',
      cta: 'Compléter',
    };
  }

  const pendingCount = documents.filter((document) => document.status === 'pending').length;
  if (pendingCount > 0) {
    return {
      title: 'Documents en vérification',
      subtitle: `${pendingCount} document${pendingCount > 1 ? 's' : ''} en attente de validation.`,
      tone: 'warning',
      cta: 'Voir',
    };
  }

  const approvedCount = documents.filter((document) => document.status === 'approved').length;
  return {
    title: 'Documents validés',
    subtitle: `${approvedCount}/${documents.length} documents approuvés.`,
    tone: 'success',
    cta: 'Consulter',
  };
}

export function getDriverVerificationBadges({
  isEmailVerified,
  driverStatus,
}: {
  isEmailVerified: boolean;
  driverStatus?: string | null;
}): DriverVerificationBadge[] {
  const badges: DriverVerificationBadge[] = [
    {
      label: isEmailVerified ? 'Email vérifié' : 'Email à vérifier',
      tone: isEmailVerified ? 'success' : 'warning',
    },
  ];

  switch (driverStatus) {
    case 'approved':
      badges.push({ label: 'Compte chauffeur approuvé', tone: 'success' });
      break;
    case 'rejected':
    case 'action_required':
    case 'suspended':
      badges.push({ label: 'Dossier à corriger', tone: 'danger' });
      break;
    default:
      badges.push({ label: 'Dossier en attente', tone: 'warning' });
      break;
  }

  return badges;
}

export function getDriverAvailabilityProfileState({
  isApproved,
  isAvailable,
}: {
  isApproved: boolean;
  isAvailable: boolean;
}): DriverAvailabilityProfileState {
  if (!isApproved) {
    return {
      label: 'Disponibilité chauffeur',
      detail: 'Disponible après validation admin',
      description: 'Votre compte doit être approuvé avant de recevoir des courses.',
      isInteractive: false,
      displayAvailable: false,
    };
  }

  if (isAvailable) {
    return {
      label: 'Disponible pour des courses',
      detail: 'Activée',
      description: 'Vous pouvez recevoir des demandes dès maintenant.',
      isInteractive: true,
      displayAvailable: true,
    };
  }

  return {
    label: 'Disponible pour des courses',
    detail: 'Désactivée',
    description: 'Activez cette option pour recevoir des demandes.',
    isInteractive: true,
    displayAvailable: false,
  };
}
