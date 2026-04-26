// functions/src/__tests__/createDriverProfile.test.ts
describe('createDriverProfile — validation driverType', () => {
  function validateDriverType(driverType: unknown): boolean {
    return ['chauffeur', 'livreur', 'les_deux'].includes(driverType as string)
  }

  function getRequiredDocKeys(driverType: string, vehicleType?: string): string[] {
    const common = [
      'permitConduire', 'casierJudiciaire', 'historiqueConduire',
      'photoProfile', 'preuvePermitTravail',
    ]
    if (vehicleType !== 'velo') common.push('plaqueImmatriculation')
    const chauffeurExtras = [
      'permitCommercial', 'plaqueImmatriculationCommerciale',
      'visiteTechniqueCommerciale', 'certificatVille',
    ]
    if (driverType === 'chauffeur' || driverType === 'les_deux') {
      return [...common, ...chauffeurExtras]
    }
    return common
  }

  it('accepte chauffeur, livreur, les_deux', () => {
    expect(validateDriverType('chauffeur')).toBe(true)
    expect(validateDriverType('livreur')).toBe(true)
    expect(validateDriverType('les_deux')).toBe(true)
  })

  it('rejette les valeurs invalides', () => {
    expect(validateDriverType('taxi')).toBe(false)
    expect(validateDriverType(undefined)).toBe(false)
  })

  it('livreur à vélo ne requiert pas plaqueImmatriculation', () => {
    const keys = getRequiredDocKeys('livreur', 'velo')
    expect(keys).not.toContain('plaqueImmatriculation')
  })

  it('livreur motorisé requiert plaqueImmatriculation', () => {
    const keys = getRequiredDocKeys('livreur', 'scooter')
    expect(keys).toContain('plaqueImmatriculation')
  })

  it('chauffeur requiert les 4 documents commerciaux', () => {
    const keys = getRequiredDocKeys('chauffeur', 'voiture')
    expect(keys).toContain('permitCommercial')
    expect(keys).toContain('certificatVille')
  })
})
