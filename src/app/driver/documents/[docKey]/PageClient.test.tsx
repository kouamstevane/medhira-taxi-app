import { CANONICAL_UPLOADABLE_DOCUMENT_KEYS } from './PageClient'

describe('document re-upload configuration', () => {
  it('allows only canonical document keys', () => {
    expect(CANONICAL_UPLOADABLE_DOCUMENT_KEYS).toEqual([
      'biometricPhoto',
      'carRegistration',
      'insurance',
      'techControl',
      'vehicleExterior',
      'workEligibility',
      'driversAbstract',
      'licenseFront',
      'licenseBack',
    ])
  })
})
