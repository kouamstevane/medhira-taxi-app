// src/__tests__/unit/bottomNav.test.ts
import { driverNavItems } from '@/components/ui/BottomNav'

describe('driverNavItems', () => {
  it('contient 4 onglets', () => {
    expect(driverNavItems).toHaveLength(4)
  })

  it('contient Activité à la place de Historique/Gains', () => {
    const hrefs = driverNavItems.map((i) => i.href)
    expect(hrefs).toContain('/driver/activite')
    expect(hrefs).not.toContain('/driver/historique')
    expect(hrefs).not.toContain('/driver/gains')
  })

  it('contient Documents', () => {
    const hrefs = driverNavItems.map((i) => i.href)
    expect(hrefs).toContain('/driver/documents')
  })

  it('les labels sont Accueil, Activité, Documents, Profil', () => {
    const labels = driverNavItems.map((i) => i.label)
    expect(labels).toEqual(['Accueil', 'Activité', 'Documents', 'Profil'])
  })
})
