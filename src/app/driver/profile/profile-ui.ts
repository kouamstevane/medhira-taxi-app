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

  const actionCount = documents.filter(doc => doc.status === 'not_submitted' || doc.status === 'rejected').length;
  if (actionCount > 0) {
    return {
      title: `${actionCount} document${actionCount > 1 ? 's' : ''} à compléter`,
      subtitle: 'Ouvrez Documents pour corriger ou téléverser les pièces.',
      tone: 'danger',
      cta: 'Compléter',
    };
  }

  const pendingCount = documents.filter(doc => doc.status === 'pending').length;
  if (pendingCount > 0) {
    return {
      title: 'Documents en vérification',
      subtitle: `${pendingCount} document${pendingCount > 1 ? 's' : ''} en attente de validation.`,
      tone: 'warning',
      cta: 'Voir',
    };
  }

  const approvedCount = documents.filter(doc => doc.status === 'approved').length;
  return {
    title: 'Documents validés',
    subtitle: `${approvedCount}/${documents.length} documents approuvés.`,
    tone: 'success',
    cta: 'Consulter',
  };
}
