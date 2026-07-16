import {
  areAllDriverDocumentsApproved,
  computeDriverDocumentsGlobalStatus,
  migrateLegacyDriverDocuments,
  normalizeDriverDocuments,
} from './catalog'

describe('driver documents catalog', () => {
  it('returns all canonical entries as not_submitted when no data exists', () => {
    const entries = normalizeDriverDocuments(undefined)

    expect(entries).toHaveLength(9)
    expect(entries.every((entry) => entry.status === 'not_submitted')).toBe(true)
  })

  it('maps legacy keys into canonical keys', () => {
    const migrated = migrateLegacyDriverDocuments({
      photoProfile: { url: 'photo-url', status: 'pending' },
      plaqueImmatriculation: { url: 'car-url', status: 'approved' },
      permitConduire: { url: 'license-url', status: 'rejected', rejectionReason: 'Flou' },
    })

    expect(migrated.biometricPhoto?.url).toBe('photo-url')
    expect(migrated.carRegistration?.status).toBe('approved')
    expect(migrated.licenseFront?.rejectionReason).toBe('Flou')
  })

  it('prefers an entry with a non-empty url when multiple legacy keys map to one canonical key', () => {
    const migrated = migrateLegacyDriverDocuments({
      vehicleRegistration: { url: '', status: 'pending' },
      plaqueImmatriculation: { url: 'car-url', status: 'pending' },
    })

    expect(migrated.carRegistration?.url).toBe('car-url')
  })

  it('computes has_rejected when any canonical entry is rejected', () => {
    const status = computeDriverDocumentsGlobalStatus([
      { status: 'pending' },
      { status: 'rejected' },
    ])

    expect(status).toBe('has_rejected')
  })

  it('requires the full canonical catalog before considering every document approved', () => {
    expect(
      areAllDriverDocumentsApproved([
        { status: 'approved' },
        { status: 'approved' },
      ]),
    ).toBe(false)

    expect(
      areAllDriverDocumentsApproved(
        normalizeDriverDocuments({
          biometricPhoto: { url: '1', status: 'approved' },
          carRegistration: { url: '2', status: 'approved' },
          insurance: { url: '3', status: 'approved' },
          techControl: { url: '4', status: 'approved' },
          vehicleExterior: { url: '5', status: 'approved' },
          workEligibility: { url: '6', status: 'approved' },
          driversAbstract: { url: '7', status: 'approved' },
          licenseFront: { url: '8', status: 'approved' },
          licenseBack: { url: '9', status: 'approved' },
        }),
      ),
    ).toBe(true)
  })
})
