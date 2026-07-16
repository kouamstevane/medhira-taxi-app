import type { DocumentEntry } from '@/types/firestore-collections'

export type DocStatus = 'pending' | 'approved' | 'rejected' | 'not_submitted'
export type DriverDocumentKey =
  | 'biometricPhoto'
  | 'carRegistration'
  | 'insurance'
  | 'techControl'
  | 'vehicleExterior'
  | 'workEligibility'
  | 'driversAbstract'
  | 'licenseFront'
  | 'licenseBack'

export interface DriverDocumentCatalogEntry {
  key: DriverDocumentKey
  label: string
}

export interface DriverDocumentStatusEntry {
  key: string
  label: string
  status: DocStatus
  url: string | null
  rejectionReason?: string
}

export const DRIVER_DOCUMENT_CATALOG: DriverDocumentCatalogEntry[] = [
  { key: 'biometricPhoto', label: 'Photo biométrique' },
  { key: 'carRegistration', label: 'Carte grise' },
  { key: 'insurance', label: 'Assurance' },
  { key: 'techControl', label: 'Contrôle technique' },
  { key: 'vehicleExterior', label: 'Photo extérieure du véhicule' },
  { key: 'workEligibility', label: "Preuve d'admissibilité au travail" },
  { key: 'driversAbstract', label: "Dossier de conduite (Driver's Abstract)" },
  { key: 'licenseFront', label: 'Permis de conduire (recto)' },
  { key: 'licenseBack', label: 'Permis de conduire (verso)' },
]

export const DRIVER_DOCUMENT_KEYS = DRIVER_DOCUMENT_CATALOG.map(
  ({ key }) => key,
) as DriverDocumentKey[]

const LEGACY_TO_CANONICAL_KEY_MAP: Record<string, string | null> = {
  photoProfile: 'biometricPhoto',
  permitConduire: 'licenseFront',
  casierJudiciaire: null,
  historiqueConduire: null,
  preuvePermitTravail: null,
  plaqueImmatriculation: 'carRegistration',
  permitCommercial: 'insurance',
  vehicleRegistration: 'carRegistration',
  vehicleInsurance: 'insurance',
  plaqueImmatriculationCommerciale: 'carRegistration',
  visiteTechniqueCommerciale: 'techControl',
  certificatVille: null,
}

function coerceDocumentEntry(entry: DocumentEntry | string | undefined): DocumentEntry | null {
  if (!entry) {
    return null
  }

  if (typeof entry === 'string') {
    return {
      url: entry,
      status: entry ? 'approved' : 'not_submitted',
    }
  }

  return {
    url: entry.url ?? null,
    status: entry.status ?? 'not_submitted',
    rejectionReason: entry.rejectionReason,
    submittedAt: entry.submittedAt,
    reviewedAt: entry.reviewedAt,
  }
}

function preferNextEntry(current: DocumentEntry | undefined, next: DocumentEntry): boolean {
  if (!current) {
    return true
  }

  return !current.url && Boolean(next.url)
}

export function migrateLegacyDriverDocuments(
  rawDocuments: Record<string, DocumentEntry | string | undefined> | undefined,
): Record<string, DocumentEntry> {
  const migrated: Record<string, DocumentEntry> = {}

  if (!rawDocuments) {
    return migrated
  }

  for (const [legacyKey, rawEntry] of Object.entries(rawDocuments)) {
    const canonicalKey = LEGACY_TO_CANONICAL_KEY_MAP[legacyKey]
    if (!canonicalKey) {
      continue
    }

    const entry = coerceDocumentEntry(rawEntry)
    if (!entry) {
      continue
    }

    if (preferNextEntry(migrated[canonicalKey], entry)) {
      migrated[canonicalKey] = entry
    }
  }

  return migrated
}

export function normalizeDriverDocuments(
  rawDocuments: Record<string, DocumentEntry | undefined> | undefined,
): DriverDocumentStatusEntry[] {
  return DRIVER_DOCUMENT_CATALOG.map(({ key, label }) => {
    const entry = rawDocuments?.[key]

    return {
      key,
      label,
      status: entry?.status ?? 'not_submitted',
      url: entry?.url ?? null,
      rejectionReason: entry?.rejectionReason,
    }
  })
}

export function computeDriverDocumentsGlobalStatus(entries: Pick<DriverDocumentStatusEntry, 'status'>[]) {
  const allApproved = entries.length > 0 && entries.every((entry) => entry.status === 'approved')
  const hasRejected = entries.some((entry) => entry.status === 'rejected')

  return allApproved ? 'all_approved' : hasRejected ? 'has_rejected' : 'pending'
}

export function areAllDriverDocumentsApproved(
  entries: Pick<DriverDocumentStatusEntry, 'status'>[],
) {
  return (
    entries.length === DRIVER_DOCUMENT_CATALOG.length &&
    entries.every((entry) => entry.status === 'approved')
  )
}
