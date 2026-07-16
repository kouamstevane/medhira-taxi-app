import {
  computeDriverDocumentsGlobalStatus,
  normalizeDriverDocuments,
} from '@/features/driver-documents/catalog'

describe('useDocumentStatus helpers', () => {
  it('returns all_approved only when every canonical document is approved', () => {
    const entries = normalizeDriverDocuments({
      biometricPhoto: { url: 'x', status: 'approved' },
      carRegistration: { url: 'y', status: 'approved' },
      insurance: { url: 'z', status: 'approved' },
      techControl: { url: 'a', status: 'approved' },
      vehicleExterior: { url: 'b', status: 'approved' },
      workEligibility: { url: 'c', status: 'approved' },
      driversAbstract: { url: 'd', status: 'approved' },
      licenseFront: { url: 'e', status: 'approved' },
      licenseBack: { url: 'f', status: 'approved' },
    })

    expect(computeDriverDocumentsGlobalStatus(entries)).toBe('all_approved')
  })

  it('returns pending for a fully empty canonical catalog', () => {
    expect(computeDriverDocumentsGlobalStatus(normalizeDriverDocuments(undefined))).toBe('pending')
  })
})
